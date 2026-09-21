# Chertt — Handoff & Runbook

WhatsApp-first church management. Members and church staff use it inside WhatsApp; the web side is a platform-admin console only.

**Stack:** Next.js 16 + TypeScript · Supabase (Postgres, RLS deny-all + service role) · Meta WhatsApp Cloud API · Google Gemini (agent edge only) · Mono (KYC) · Paystack (giving) · Vitest · Vercel (push-to-main deploy).

---

## 1. How it works (the shape)

- **Every task is a deterministic "rail"** — a step-by-step state machine in `src/lib/services/flows/`. The bot asks one thing at a time and confirms before writing. It does not free-wander.
- **The LLM is only on the edges** — genuine off-script questions. Core tasks never depend on it.
- **One inbound entry point:** `src/lib/services/whatsapp-processor.ts` → `processWhatsAppMessage()`. It routes in this order: message-claim (dedupe) → welcome/consent gate → risk triage → `#reset` → escape hatch (menu/cancel/exit) → hashtag shortcuts → active flow → join/admin codes → onboarding → reports → service-report read → child-safety FAQ → typed-intent router → agent fallback.
- **Menus** (`src/lib/services/agent/menu.ts`): a two-level grouped menu, role-filtered. ≤3 items render as buttons, more as a list.
- **Tools** (`src/lib/services/agent/*-tools.ts`): the actual writes/reads, each rank-gated (`minRank`) and some `requiresConfirmation`. Rails call tool handlers directly and re-check access.

## 2. Repo layout (the parts that matter)

- `src/lib/services/whatsapp-processor.ts` — inbound router (the brain).
- `src/lib/services/flows/` — every rail + `engine.ts` (the state machine) + `index.ts` (registration).
- `src/lib/services/agent/` — `runtime.ts` (Gemini tool loop), `menu.ts`, `access.ts` (permissions), `*-tools.ts`.
- `src/lib/services/identity/` — people, provisioning, `role-catalog.ts` (roles & ranks), KYC.
- `src/lib/services/children/` — check-in state, classrooms, guardianships.
- `src/lib/services/safety/risk.ts` — scam / safeguarding triage.
- `src/app/admin/` — the platform-admin web console. `src/app/onboard/[token]/` — church KYC signup.
- `CHRONICLE.md` — the full running build log (§0 = live state). Read it first.

## 3. Run it locally

```
npm install
npm run dev          # Next dev server
npx tsc --noEmit     # typecheck (must be 0 errors)
npx vitest run       # full test suite (currently ~895 tests green)
```

Secrets live in `.env.local` (gitignored). Never commit secrets. Never `git add -A` — add explicit paths.

## 4. Environment variables

**Required to run at all**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — database.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_DISPLAY_NUMBER` — Meta WhatsApp Cloud API.
- `NEXT_PUBLIC_APP_URL` — public base URL (QR/label/pay links).
- `OTP_PEPPER` — server-side pepper for verification codes.

**AI edge**
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) — the agent. Without it, the agent path no-ops and rails still work.

**KYC / signup**
- `MONO_SECRET_KEY` — BVN/NIN verification. **Must be a valid LIVE key for church signup to work.**

**Email (member/KYC verification)**
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Resend (fallback/alt): `RESEND_API_KEY`, `RESEND_FROM`.

**Giving**
- `PAYSTACK_SECRET_KEY` — live card giving. Until set, giving returns a demo link (no charge).

**Platform admin & ops**
- `PLATFORM_ADMIN_EMAILS` — who can log into `/admin`.
- `PLATFORM_ADMIN_PHONES` — who gets platform alerts / can act as platform admin on WhatsApp.
- `CRON_SECRET` — guards `/api/cron`.
- `ALLOW_DEMO_BILLING` — leave unset in prod (enables the billing placeholder only when `true`).

**WhatsApp message templates** (for messages outside the 24h window — approvals/alerts)
- `WHATSAPP_TEMPLATE_NEW_SIGNUP`, `WHATSAPP_TEMPLATE_ORG_APPROVED`, `WHATSAPP_TEMPLATE_ORG_REJECTED`. See `docs/kyc-whatsapp-templates.md`.

## 5. Deploy

Push to `main` → Vercel builds and deploys to production. Set all env vars in the Vercel project (Production scope). The WhatsApp webhook points at `/api/whatsapp/webhook` (verify token = `WHATSAPP_VERIFY_TOKEN`).

## 6. Go-live checklist (owner tasks — not code)

- [ ] Valid **Mono live key** in Vercel → church signup/KYC works.
- [ ] **Paystack keys** in Vercel → giving charges for real (else demo link).
- [ ] **Email vars** confirmed in Vercel prod → verification emails send.
- [ ] **WhatsApp templates** created and approved in Meta, env vars set → approval messages + any future reminders.
- [ ] Meta WhatsApp number connected; webhook verified.
- [ ] `PLATFORM_ADMIN_EMAILS` / `PLATFORM_ADMIN_PHONES` set to the real operators.
- [ ] Decide: currency (Naira-only today) and data-ownership policy.
- [ ] **Move the repo off the OneDrive-synced Desktop** (it has zeroed files before).

## 7. Roles & permissions

Ranks (church): `member`(0) → `children`/`dept_leader`(1) → `secretary`/`operations`/`it_technical`(2) → `finance`/`approver`(3) → `pastoral`/`pastor`(4) → `admin`(5) → `owner`/`senior_pastor`/`creator`(6). Rank 4+ can assign roles, never above their own. Source of truth: `identity/role-catalog.ts`. Execution gating: `agent/access.ts` (`minRank`, `dataSensitive`).

## 8. Operating runbook

- **Approve a new church:** platform admin logs into `/admin/kyc`, reviews the pending church, approves → the admin is messaged on WhatsApp.
- **`#reset`** (WhatsApp): wipes the sender's own chat memory + church links — fresh start. Useful for re-testing.
- **Hashtag shortcuts:** `#menu #give #checkin #pickup #prayer #pastor #register #events #giving #qr`. Unknown `#x` lists them.
- **Escape:** `menu` / `cancel` / `exit` / `quit` / `start over` always leave any flow.
- **Platform admin console** `/admin`: churches, KYC, people, NDPR data requests, flagged messages, settings, overview.

## 9. Live vs pending

- **Live:** all WhatsApp journeys (onboarding, giving flow, prayer, pastoral, children incl. guardian-gated pickup and add-guardian, events, members, service records, reports, announcements, safety).
- **Pending owner config:** live payments (Paystack), live KYC (Mono key), prod email, WhatsApp templates.
- **Deferred by decision:** proactive reminders/broadcasts (needs approved templates), multi-currency, KYC selfie/face-match.

## 10. Testing

Vitest, ~895 tests, colocated `*.test.ts`. Run `npx vitest run`. Typecheck with `npx tsc --noEmit`. Both must be clean before deploy. Flows are unit-tested per rail; the processor router has its own suite.

## 11. Known tech debt

- `identity/assign-role-flow.ts` still holds the **legacy** `startAssignRoleFlow`/`advanceAssignRoleFlow` (superseded by `flows/assign-role.ts` on the engine). Safe to delete with its tests.
- Legacy **WhatsApp step-signup** (`advanceSignupFlow` in `onboarding-flow.ts`) is superseded by web KYC; unreachable from the processor.
- `whatsapp-reports.ts` still contains **dead SME report branches** (`customers`/`sales`/`wallet`/`inventory`/`expenses`) unreachable via `matchReportIntent`. Safe to remove.
- No **church-facing web dashboard** — church staff operate via WhatsApp only. If finance/leadership want a login with charts/exports, that is a new build (see the PM note).

## 12. Pointers

- `CHRONICLE.md` — full build history and current state.
- `docs/kyc-whatsapp-templates.md` — the 3 Meta template bodies + env vars.
- `Chertt-Platform-and-Features.docx` — client-facing feature report.
- `Chertt-UAT-Criteria.docx` — the UAT test plan.
- Specs: `docs/superpowers/specs/` (identity spine, agentic engine).
