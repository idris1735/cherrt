# Chertt — Engineering Handoff Brief

> **Audience:** DeepSeek (the coding agent). **Author:** Claude (project review + prompts/plans). **Date:** 2026-08-10.
> This is the single document that transfers full context. Read it top to bottom before touching code. The living, always-current log is `CHRONICLE.md` §0 — read that too.

---

## 0. How we work together

- **Roles:** Claude reviews the project and writes the specs/plans/prompts; **DeepSeek writes the code**; Claude reviews. You (DeepSeek) implement against a written plan, task by task.
- **Method:** brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → **TDD execution**. Every task = write a failing test → run it (see it fail) → implement → run it (green) → commit. One commit per task. Never batch many features into one commit.
- **Cadence:** foundation-first, one module at a time. Weekly: agree scope early-week, build+test, **validate Saturday** (virtual) with the owners, correct, move on. Don't drag past the month.
- **Definition of done for any slice:** all its tests pass, `npx tsc --noEmit` clean, `npm run build` compiles, migrations applied, merged to `main` (Vercel auto-deploys), and `CHRONICLE.md` §0 updated.

---

## 1. What Chertt is

A **WhatsApp-first AI church-management platform** for the Nigerian market. WhatsApp **is the product**; the web app is an **internal admin console only** ("imagine there is no web app… the magic backend"). The engine must run the whole church end-to-end from WhatsApp with zero reliance on any web UI.

The AI is an **agentic assistant** over a shared tool layer: a linked user sends free text/voice/photo on WhatsApp, an LLM (Gemini 2.5 Flash) decides which typed, role-scoped tool to call, and replies. The same tools are the system of action.

**Hard product rule:** the bot **never prays, counsels, or gives spiritual guidance** — it *refers* to a human (pastor/leader). It captures prayer/pastoral-care requests and routes them.

---

## 2. Owner mandates (non-negotiable — from the 2026-08-01 review)

Kolawole Oladunmoye (church-domain/product owner) + Isaiah D. Etuk (technical architect):

1. **Demo is eradicated.** One real product. No demo/live split, no seeded fake church, no auto-assigned Senior Pastor. (All demo code is already removed.)
2. **"Creator" on signup, never Senior Pastor.** Whoever sets up a church is a `creator`. Plus an **IT/technical** role that fixes modules but sees no data.
3. **Real KYC** for church onboarding: **CAC (Incorporated Trustees) + NIN via Mono**, manual review of every church, then approval.
4. **Tiered access** (banking-app style): unverified churches can do nothing sensitive (money, add members, broadcast).
5. **One person, many churches.** Identity is the person; roles are per-church.
6. **A visible admin dashboard** so the foundation is inspectable ("magic backend").
7. **Foundation-first, module-by-module**, weekly Saturday validation.

---

## 3. Tech stack & infrastructure

- **Next.js 16** (App Router; `params`/`searchParams` are async `Promise`s — always `await` them). TypeScript everywhere.
- **Supabase** (Postgres). **RLS is deny-all** on sensitive tables; server code uses the **service-role client** (`getSupabaseServerClient()`) which bypasses RLS. A user-JWT client (`getSupabaseUserClient(token)`) is used only to verify a caller's identity.
- **Vitest** for tests (jsdom env, `vitest.setup.ts`).
- **Google Gemini 2.5 Flash** — function-calling agent (`src/lib/services/agent/`).
- **Meta WhatsApp Cloud API** — inbound webhook → `whatsapp-processor.ts`; outbound via `whatsapp.ts` (`sendTextMessage`, `sendInteractiveButtons`) and `whatsapp-templates.ts` (approved templates).
- **Mono** — Nigerian KYC (CAC/IT + trustees + NIN with photo). Client: `src/lib/services/kyc/mono.ts`.
- **Resend** — transactional email (email OTP). `src/lib/services/kyc/email-otp.ts`.
- **Paystack** — payments (behind a keys check; not the current focus).
- **Vercel** — push to `main` auto-deploys. `git push` = deploy.

---

## 4. Architecture (the important part)

### 4.1 Identity & tenancy spine
The human is the entity. Three tables (migration `20260721_identity_spine.sql`):
- **`people`** — `id, full_name, preferred_name, auth_user_id?`.
- **`phone_contacts`** — `phone_number, person_id, status('active'|'retired'), verified_at`. A phone points at a person; `verified_at` set when proven (inbound WhatsApp).
- **`branch_memberships`** — `person_id, workspace_id, role, unit?, status('active'|'left'|'guest')`. A role is a person × workspace.

Above workspaces sit **`organizations`** (churches) → **`workspaces`** (branches). `workspaces.organization_id` is nullable (legacy/demo workspaces have none).

Key services in `src/lib/services/identity/`:
- `provisioning.ts` — `ensureVerifiedPerson(phone)` (inbound = Level 1 verified), `provisionPersonMembership({phoneNumber, fullName, workspaceId, workspaceSlug, workspaceName, role, organizationId})`, `resolvePersonIdByPhone`.
- `resolver.ts` — phone → person → memberships → active membership (disambiguates by `activeWorkspaceId`).
- `verification.ts` — `verificationLevel(personId): 0|1|2` (0 unverified, 1 WhatsApp-verified, 2 KYC-verified).
- `role-catalog.ts` — `ROLE_RANK` (authority ranks; `creator`=6, `it_technical`=2, etc.), `foundingAdminRole(vertical)` (`"church"`→`"creator"`), `canAssignRole(actorRole, targetRole)`.
- `otp.ts` — `sendOtp(phone, purpose)`, `verifyOtp(phone, purpose, code)`. Purposes: `'migrate'|'step_up'|'email'`. **Atomic single-use consume** (conditional UPDATE stamps `consumed_at`; no replay/TOCTOU). Table `otp_challenges` (RLS deny-all).

### 4.2 The agent engine (`src/lib/services/agent/`)
- `tools.ts` — `AgentTool` type (`name, description, parameters, minRank?, mutates?, dataSensitive?, handler(args, ctx)`) + `AgentContext` (`workspaceId, role, userName, phone, personId`). Read tools live here.
- `church-tools.ts` — `CHURCH_TOOLS`: `record_giving`, `add_member`, `capture_prayer_request`, `capture_first_timer`, `request_pastoral_care`, `list_prayer_requests`, `list_first_timers`, `get_top_givers`, etc.
- `runtime.ts` — `runAgentLoop` (injectable `generate` for tests; executes tools, feeds results back, step-capped, catches tool errors), `runAgentQuery` (real Gemini entry), `runGuestAgent` (unlinked users).
- `access.ts` — `toolAccessError(tool, ctx)`: gates by `minRank` and denies `it_technical` on `dataSensitive` tools. **This is synchronous** — do not add async DB calls here.
- Tiered access is enforced *inside* sensitive handlers via `churchApproved(ctx.workspaceId)` (see 4.4), not in `access.ts`.

### 4.3 The WhatsApp processor (`whatsapp-processor.ts`)
The main inbound router. Order matters. Roughly: dedupe → `ensureVerifiedPerson` → resolve identity/link → multi-church disambiguation → onboarding-flow advance → signup/assign-role triggers → approvals → reports → **agent dispatch** (primary handler for linked free text) → media (voice/image). Menus via `sendMainMenu`. Guests (no link) fall to `runGuestAgent`.

### 4.4 KYC subsystem (`src/lib/services/kyc/`) — Phase 1 Slice 2/4
- `mono.ts` — `monoCacLookup`, `monoCacTrustees`, `monoNinLookup` (maps Mono's snake_case → camelCase; NIN returns `photoBase64`).
- `applications.ts` — `startApplication(phone)` (draft + single-use token, 24h), `resolveByToken(token)`, `updateApplication(id, patch)`, `runKycChecks({id, itNumber, churchLegalName, idType, idNumber, applicantRole})` (CAC + trustee match + NIN → records results, does NOT auto-approve).
- `trustee-match.ts` — `matchTrustee(applicantName, trustees)` → `'match'|'no_match'|'unknown'` (anti-hijack: applicant's NIN name must be a trustee).
- `email-otp.ts` — `sendEmailOtp(email)` (Resend), `verifyEmailOtp` (reuses `verifyOtp` with purpose `'email'`).
- `storage.ts` — private `kyc` bucket; `uploadKycFile`, `signedKycUrl` (60-min signed URLs; selfies never public).
- `admin-auth.ts` — `platformAdminEmail(token)`: verifies JWT, returns email iff on `PLATFORM_ADMIN_EMAILS` allowlist. The single server-side gate for `/admin`.
- `review.ts` — `listPendingApplications`, `getApplicationForReview` (signed selfie + Mono ID photo data-URL for manual compare), `approveKycApplication` (creates org+workspace, seats `creator`, resumes WhatsApp setup, notifies — idempotent, pending-only), `rejectKycApplication`.
- `tiered-access.ts` — `churchApproved(workspaceId)` (org `active`; fail-open on no-org/error). Gates `record_giving` + `add_member`.
- Table: `kyc_applications` (RLS deny-all). Flow states: `draft → pending → approved|rejected`.

**Applicant web flow:** `/onboard/[token]` (form) → `POST /api/onboard/email-code` (Resend OTP) → `POST /api/onboard/submit` (verify email, store selfie, `runKycChecks`, set `pending`).

**Trigger:** WhatsApp "set up my church" → `startSignupFlow` (`onboarding-flow.ts`) mints a token and texts `${NEXT_PUBLIC_APP_URL}/onboard/{token}`. The old in-chat pending-org signup is retired.

### 4.5 Admin console (`src/app/admin/`) — Phase 1 Slice 3
Vercel-minimal **light** dashboard, gated by `PLATFORM_ADMIN_EMAILS`. Client pages call server-enforced routes.
- `admin.module.css` — the shared design kit (built ONLY on `globals.css` `:root` tokens: `--bg, --surface, --ink, --muted, --line, --accent, --radius-*, --shadow, --font-sans`). Reuse these; don't invent colors except semantic status green/amber/red.
- `layout.tsx` + `admin-nav.tsx` — shell + nav (Overview · Churches · KYC).
- `page.tsx` (overview), `churches/page.tsx` (list), `churches/[id]/page.tsx` (detail), `kyc/*` (review).
- `use-admin-fetch.ts` — `adminFetch<T>(path)` attaches the Supabase session JWT.
- Service: `src/lib/services/admin/foundation.ts` (`platformOverview`, `listChurches`, `getChurchDetail`). Routes: `/api/admin/overview`, `/api/admin/churches`, `/api/admin/churches/[id]` (all `platformAdminEmail`-gated).

---

## 5. Conventions & house rules

- **TDD, per task.** Failing test → fail → implement → pass → commit. Test the service/route logic; verify UI pages via `tsc` + `build`.
- **Migrations:** `supabase/migrations/YYYYMMDDHHMMSS_name.sql`. **Use a full distinct timestamp** — bare-date versions (e.g. two files at `20260805`) collide on `schema_migrations_pkey`. Apply with `npx supabase db push`; check with `npx supabase db push --dry-run`. New sensitive tables: `enable row level security` with no policies (deny-all; service role bypasses).
- **RLS deny-all + service role.** Never expose sensitive tables to the anon client. Reads for the console/agent go through `getSupabaseServerClient()` in server code.
- **Secrets:** never commit. `.env.local` is gitignored. **Never `git add -A`** (it has swept in secrets/junk before) — stage explicit paths. Never disable TLS for DB.
- **Branches:** feature branch → merge `--no-ff` to `main` → push (deploys) → delete branch. Don't build on `main` directly.
- **Chronicle:** keep `CHRONICLE.md` §0 (most-recent-first) current with every meaningful step.
- **Voice:** church-appropriate, warm, Nigerian context. The bot refers spiritual needs to humans; it never prays/counsels.
- **Confirm-before-consequential** for money/role changes; audit tool calls (`recordToolAudit`).

### Test gotchas (learned the hard way)
- **`vi.hoisted`** for any mock referenced inside a `vi.mock` factory (plain top-level consts are in the TDZ when the hoisted factory runs → silent wrong instance).
- **Mocking a class used with `new`** (e.g. Resend): mock it as a real `class { ... }`, not `vi.fn().mockImplementation(() => obj)` — `new` doesn't reliably return the impl's object.
- **ESM internal calls aren't mockable** — mocking a module's export doesn't intercept a sibling function's internal call to it. Mock the *dependency* (e.g. Supabase) instead, or split into separate modules.
- **Fail-open on unexpected mock shapes** — e.g. `churchApproved` wraps its query in try/catch returning `true`, so existing handler tests whose Supabase mocks don't cover the new query still pass (and real churches are never wrongly blocked).

---

## 6. Current state — PHASE 1 COMPLETE ✅

All merged to `main`, deployed. **409 tests pass, `tsc` clean, `build` compiles, migrations up to date.**

Phase 1 (Foundation: Church & Identity) delivered:
- Person identity via WhatsApp + inbound-verified (L1) + OTP step-up + number migration.
- `creator` + `it_technical` roles; admin-assigned roles; `it_technical` denied data access.
- Real KYC (CAC+NIN via Mono) → web form → checks → review dashboard → approval (creates church, seats creator, notifies, resumes setup).
- Tiered access (giving/add-member blocked until approved).
- Multi-church disambiguation; join by code/QR; guest **conversation** path.
- Visible admin foundation console.

**Known deferrals / external deps (not gaps):** guest *membership creation* is schema-ready but lands in a later slice (the guest *chat* path works); WhatsApp approve/reject notifications need Meta-approved templates `chertt_org_approved`/`chertt_org_rejected`; the console is read-only by design; one cosmetic stale "guest/demo mode" string at `whatsapp-processor.ts:303`.

---

## 7. The roadmap (all I want to achieve)

The finished product runs an entire Nigerian church from WhatsApp, with the web console as the inspectable backend. Four phases:

1. **Foundation: Church & Identity — ✅ DONE.**
2. **People & Pastoral Care — NEXT.** Member + **children** registration (prereq for check-in); first-timers; **prayer (referral only)**; pastoral care + its forms (dedication, naming, house dedication, pre-marital, training schools); **life journeys folded into pastoral care**; join a department as a proper form.
3. **Sunday & Giving.** Rich service records (gender, youth/nursing, giving types tithe/offering/special/building, **multi-currency**, sermon title, first-timers, salvations, general report; captured by different volunteer groups); attendance; **real giving** (payments, types, multi-currency, receipts) + reports/top givers; approvals & money oversight.
4. **Engagement & Church-Day Ops.** Children's **check-in** subsystem (pre-check-in/seat-hold, classroom capacity, printable labels, device-locked check-in/out + delegation, teacher acceptance, safe pickup); facilities/ops (issues, supplies, lost&found, office guests, volunteers, birthdays); announcements & events (events ARE announcements; some trigger registration); proactive Chertt (reminders/follow-ups; gated on WhatsApp billing); multi-branch oversight.

**Cross-cutting every phase:** role-gating, confirm-before-consequential, privacy/NDPR, the console view, menu/help/QR, voice & photo, audit.

---

## 8. Phase 2 — what to build next (starting point for its spec)

Build order (each a small TDD slice; folds member data model first because everything else references a person):

1. **Member registration** — a WhatsApp flow + `add_member` already exists; extend to a proper member profile (name, phone→person, gender, DOB, address, join a branch). Reuse the identity spine; a member = `people` + `branch_memberships(role='member')`. Console: show members in church detail (already partially there).
2. **Children registration** — children are `people` too but linked to guardian person(s) via a new `guardianships` table (child_person_id, guardian_person_id, relationship). This is the **prerequisite for Phase-4 check-in** — model it cleanly now (child, guardians, allergies/notes, classroom/age-group).
3. **First-timers** — capture (`capture_first_timer` exists) → a first-timer record with follow-up state; list for pastors; convert to member.
4. **Prayer (referral only)** — `capture_prayer_request` exists; ensure it **only routes to a human** (never an AI "prayer"), with assignment + status. Reinforce the no-counsel rule.
5. **Pastoral care + forms** — a generic **form engine** for: baby dedication, child naming, house dedication, pre-marital counselling booking, training-school enrolment. Each form = a schema + submissions + a review/assignment workflow. **Life journeys** (milestones: salvation, baptism, dedication, marriage) are folded in as pastoral records on the person's timeline.
6. **Join a department** — a proper request/approval form (person → department/`unit` → leader approves), writing `branch_memberships.unit` or a `department_memberships` table.

**Design notes for Phase 2:** keep the person as the spine; new records reference `person_id` + `workspace_id`. Gate sensitive/leadership reads by role rank (`toolAccessError`/`minRank`). Every capture has a WhatsApp path first; the console just *shows* it. New tables: RLS deny-all. Follow the KYC subsystem's shape (`src/lib/services/<domain>/` service + gated routes + tests).

---

## 9. Open decisions (flag these; they gate later work — owner call at Saturday review)

1. **Data ownership** — is Chertt the system-of-record (churches enter data + Excel import) or does it integrate with churches' existing systems? Changes how everything is stored.
2. **WhatsApp billing/templates** — confirm template approvals + that all business-initiated messages are billable. Gates proactive messaging (Phase 4) and the approve/reject notifications.
3. **Church-context resolution** — one WhatsApp number per church vs one shared number with church-selection. Ties into identity + billing.

**Reality check:** the WhatsApp Cloud API exposes the sender's phone number (`wa_id`) + profile name, **NOT IMEI/device id** — so "device-lock via IMEI" is not achievable. Use phone-as-identity + OTP/2FA for sensitive actions.

---

## 10. Environment variables (names only — values live in Vercel / `.env.local`, never in git)

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY` (agent), WhatsApp Cloud API creds (token, phone-number-id, verify token)
- `MONO_SECRET_KEY` / `MONO_PUBLIC_KEY` — **sandbox in dev, live in prod** (live lookups cost real ₦)
- `RESEND_API_KEY` (+ optional `RESEND_FROM`) — email OTP
- `PLATFORM_ADMIN_EMAILS` (comma-separated allowlist for `/admin`), `PLATFORM_ADMIN_PHONES`
- `OTP_PEPPER` (must be a real secret in prod), `NEXT_PUBLIC_APP_URL` (real domain → onboard links)
- Paystack keys (payments, later)

---

## 11. Key files index

- `CHRONICLE.md` §0 — the living log. **Read first.**
- `docs/superpowers/specs/` + `docs/superpowers/plans/` — every slice's design + plan (KYC engine, web form, review dashboard, connect+tiered, admin console).
- `src/lib/services/whatsapp-processor.ts` — inbound router (the spine of behavior).
- `src/lib/services/identity/*` — people, roles, verification, OTP.
- `src/lib/services/agent/*` — the tool-calling engine + tools + access gating.
- `src/lib/services/kyc/*` — the whole KYC subsystem (good template for new domains).
- `src/lib/services/onboarding-flow.ts` — signup (→ web KYC) + post-approval setup.
- `src/app/admin/*` — the console + design kit. `src/app/onboard/[token]/*` — applicant form.
- `src/app/globals.css` `:root` — the design tokens (Vercel-minimal light).

---

## 12. First actions for DeepSeek

1. Read `CHRONICLE.md` §0 and this brief. Skim the `kyc/` subsystem as the reference pattern.
2. Wait for the Phase-2 spec (Claude writes it after the Saturday validation / open-decision answers). Do not start Phase 2 code before the spec + the data-ownership decision — it changes the storage model.
3. Meanwhile, a safe, self-contained cleanup: fix the stale `"guest/demo mode"` string at `whatsapp-processor.ts:303` (demo is eradicated). Small, tested, one commit.
4. Always: TDD, explicit `git add` paths, per-task commits, `tsc` + `build` before merge, update the Chronicle.
