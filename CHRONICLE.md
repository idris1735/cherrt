# Chertt — Complete Project Chronicle

> Every conversation, decision, and discovery from July 16, 2026 onward.

---

## 0. Active Work Log (LIVING — most recent first)

**This is the single running log of what we're building and where it stands.** The numbered sections below (§1+) are the standing reference; this section is the live state. Keep it current with every meaningful step.

### The roadmap (the "magic backend"), in dependency order
WhatsApp is the product; the web app is an internal admin console only (confirmed 2026-07-21). The backend must run the whole business end-to-end with zero reliance on any web UI. Subsystems, foundation-first:

1. **Identity & Tenancy Spine** ← *in progress* — who is speaking, which branch, what role/authority.
2. **Roles & Authority** — folded into #1 (curated per-vertical role catalog → capability bundles).
3. **Onboarding & Provisioning** — folded into #1 (person/role-aware).
4. **Agentic Engine** — single-shot classifier → real tool-calling agent ("the crazy work rate"). *✓ church module CORE COMPLETE — agent is the primary church handler (creator is fallback). Remaining church items are gated on external setup: payments, WhatsApp templates, cron.*
5. **Workflow Engine** — approvals, routing, multi-step life-journeys as state machines.
6. **Memory & Context** — the "it remembers" layer. *← recall DONE; proactive/scheduled cron scaffold DONE (daily discipleship live; more jobs pluggable).*
7. **Capabilities & infra** — church executors ✓, cron ✓, **payments (Paystack) ✓ behind keys check**; Store/Events still on the old creator; approved WhatsApp templates still pending (external).

### 2026-07-21 — Identity & Tenancy Spine (v1 BUILT, tests green)
**Spec:** `docs/superpowers/specs/2026-07-21-identity-tenancy-spine-design.md`

Decisions locked: person-centric identity (human is the entity; phones point at them; role = person × branch); curated per-vertical role catalog → capability bundles; schema-ready but behavior-phased for shared-phone/number-change; additive migration (zero data loss); deterministic assign-role in v1.

**Built (commits `6edd089`→`ee390a4`):**
- **Schema** `supabase/migrations/20260721_identity_spine.sql` — `people` / `phone_contacts` / `branch_memberships` + `organization_admins.person_id`, with idempotent backfill from `whatsapp_phone_links`. *(Written; NOT yet applied to Supabase — that's a deploy step.)*
- **Role catalog** `src/lib/services/identity/role-catalog.ts` — per-vertical roles, ranks, `canAssignRole` escalation guard; `policy-guard` extended with capability bundles for the new roles.
- **Resolver** `src/lib/services/identity/resolver.ts` — phone → person → memberships → role, pure disambiguation helper.
- **Provisioning** `src/lib/services/identity/provisioning.ts` — `provisionPersonMembership` (dual-writes new tables + legacy `phone_links`), `setMembershipRole`, `listBranchMembers`. Onboarding now seats real roles: founder → `senior_pastor`, branch claim → `pastor`, member JOIN → real person.
- **Assign-role** `src/lib/services/identity/assign-role-flow.ts` — guided pick-member→pick-role→confirm, wired into the processor. 173 tests pass, typecheck clean.

Reused as-is (not rebuilt): org→branch hierarchy, one-phone-many-branches links, `organization_admins`, the full signup/approval/setup/join/claim choreography, active-branch disambiguation.

**Read-path cutover DONE (commit `c29f86e`):** the processor now resolves identity via `resolveIdentityByPhone` first, falling back to legacy `whatsapp_phone_links` only when the new model has nothing — safe before/after the migration is applied.

**Split-brain fix (commit `f11f45d`):** `getApproverPhone` now resolves the branch's most-senior member via the person model instead of the web-only `memberships` table (which the WhatsApp flow never wrote to — approval notifications had been silently returning null for WhatsApp-onboarded churches).

**Migration APPLIED to Supabase (2026-07-21).** Reconciled CLI history (`migration repair` marked the 19 already-applied migrations as applied — the remote history table was empty), then `supabase db push` applied only `20260721_identity_spine.sql`. Backfill ran and correctly produced 0 rows: `whatsapp_phone_links` is empty (no real WhatsApp onboarding data yet; the 2 workspaces are demo). New tables (`people`/`phone_contacts`/`branch_memberships`) are live and RLS-enabled. Added a minimal `supabase/config.toml` (project_id) so CLI migrations run from the repo.

**Remaining:**
1. Once real onboarding data accrues in the new model, retire the legacy `whatsapp_phone_links` table + the fallback path.
2. Phase-2 behaviors: shared-phone "who's speaking", verified number-change, role-scoped invites.
3. **Security housekeeping:** rotate the Supabase DB password (shared in chat) and the leaked WhatsApp token in `probs.txt`; gitignore `probs.txt`.

**Housekeeping flag:** `probs.txt` (untracked, contains a leaked WhatsApp token per earlier notes) still needs the token rotated + the file gitignored.

### 2026-07-21 — Agentic Engine (foundation built, not yet wired)
**Spec:** `docs/superpowers/specs/2026-07-21-agentic-engine-design.md`

Today's `runCherttCommand` is a single-shot classifier (one Gemini call → one flat artifact; can't query/read or chain). Moving to a bounded **tool-calling loop** where Gemini calls typed, workspace-scoped tools.

**Built (Increment 1 — foundation, standalone, not wired into the processor yet):**
- `src/lib/services/agent/tools.ts` — `AgentTool`/`AgentContext` + 5 read-only tools wired to existing services (`get_giving_summary`, `get_pending_requests`, `get_low_stock`, `get_open_issues`, `list_members`).
- `src/lib/services/agent/runtime.ts` — `runAgentLoop` (injected `generate` for testability; executes tools, feeds results back, step-capped, catches tool errors) + `runAgentQuery` (real Gemini 2.5 Flash function-calling entry).
- 11 tests (loop happy-path, ctx scoping, unknown-tool + throwing-tool error feedback, step cap; tool registry + handler scoping). 184 tests pass, typecheck clean.

**Increment 2 DONE — wired into the processor.** A linked user's question-like free text (`looksLikeQuestion` heuristic — routes questions, leaves creation verbs to the creator) that the deterministic report matcher missed now goes to `runAgentQuery`; its answer is sent over WhatsApp. Falls through to the creation path when Gemini is unavailable or the agent returns nothing (so nothing breaks without a key). 189 tests pass.

**Increment 3a DONE — safe action tools.** `src/lib/services/agent/actions.ts` adds `log_expense`, `report_issue`, `add_inventory_item` (direct workspace-scoped inserts, input-validated) — the creations the existing system makes WITHOUT a confirmation gate. The agent is offered read + these action tools. Routing: `looksLikeAgentAction` (a conservative regex for expense/issue/inventory phrasings) also sends free text to the agent. Confirmation-gated creations (documents, payments, giving, high-value requests) still go to the single-shot creator. 198 tests pass.

**Increment 3b DONE — confirmation-gated agent actions.** The loop returns an `AgentOutcome` (`text` | `pending`); a tool marked `requiresConfirmation` (first: `draft_document`) is surfaced as a proposal, never executed during reasoning. The processor stores it in `session.pendingAgentAction` (new persisted column `whatsapp_sessions.pending_agent_action`, migration `20260722` **applied to Supabase**), sends a preview, and executes the exact proposed tool call on "YES" (checked before the single-shot creator's confirm handler so they never cross-wire). Document phrasings now route to the agent; falls back to the creator when Gemini is unavailable. 200 tests pass.

**Church operations DONE — the agent now covers ChurchBase end-to-end.** New tables `prayer_requests` / `first_timers` / `pastoral_care_requests` (migration `20260723`, applied). Church tools (`src/lib/services/agent/church-tools.ts`): captures — `capture_prayer_request` (with anonymity), `capture_first_timer`, `request_pastoral_care`, `record_giving` (received, type-normalized); reads — `list_prayer_requests` (masks anonymous), `list_first_timers`. Agent system prompt is church-first. `CHURCH_ACTION_RE` routes prayer/first-timer/pastoral/giving phrasings to the agent (fallback to the creator when Gemini is off). 210 tests pass.

**Agentic engine status:** the agent is now a genuine read+write, confirmation-aware tool-caller covering the church module's core operations. The single-shot creator remains only as a fallback (and for non-church verticals). **Remaining (lower priority for church):** member-giving *payment* flow (virtual account / Paystack — the real-payments gap), event registration + child check-in tools, and eventually retiring the creator.

### Children's check-in DONE (agent-native, 2026-07-21)
New table `child_checkins` (migration `20260724`, applied). Tools in `src/lib/services/agent/child-tools.ts`: `check_in_child` (captures name/age/allergies/guardian, returns a 4-digit pickup code), `lookup_child_pickup` (volunteer verifies the guardian by code), `release_child` (**confirmation-gated** for child-safety — proposes, executes on YES, refuses an unknown/already-collected code). WhatsApp-native — no camera scanner needed. Routing via `CHURCH_ACTION_RE` (check-in/pickup/drop-off/release). 218 tests pass.

### Events + departments DONE (agent-native, 2026-07-21)
New tables `event_registrations` + `department_memberships` (migration `20260725`, applied). Tools in `src/lib/services/agent/community-tools.ts`: `list_events`, `register_for_event` (matches an event by name, refuses if none found), `list_departments`, `join_department` (pending application against a matched ministry unit). Routed via the events/ministry additions to `CHURCH_ACTION_RE`. 226 tests pass.

### Life-journey intakes DONE (agent-native, 2026-07-21)
New table `life_journeys` (flexible jsonb `details`, migration `20260726`, applied). Tools in `src/lib/services/agent/journey-tools.ts`: `start_bereavement_support`, `register_marriage_prep`, `register_baptism`, `enroll_discipleship`, `list_life_journeys` (pastor follow-up view). Routed via bereavement/marriage/baptism/convert additions to `CHURCH_ACTION_RE`. The daily discipleship *content delivery* still needs a scheduler/cron — enrolment/intake works now. 233 tests pass.

### Security hardening — Fable review + fixes (2026-07-22)
A fresh senior review (model: Fable, read-only) caught that the identity spec promised "capability gating reuses policy-guard" but the agent tools shipped **without role gating** — the highest-profile new feature (recall) also matched by name-string, not person_id. **Honest note (per Fable's advice):** these were oversights that shipped under "skip the ceremony, keep coding," not tracked exceptions — the earlier "CORE COMPLETE" status did not flag them. Fixed comprehensively:
- **Role gating on every sensitive tool** — `src/lib/services/agent/access.ts` (`toolAccessError`, fails closed). Per-tool `minRank`: financial-ledger writes (`record_giving`, `log_expense`) + `get_giving_summary` → finance(3); rosters/PII/`list_first_timers`/pending/inventory/issues → secretary(2); `list_prayer_requests`/`list_life_journeys` → pastor(4); child `lookup`/`release` → volunteer/leader(1); announcements → admin(4). Member self-service (prayer, pastoral care, give_now, event/department, check_in_child, life-journey intakes) and public reads (events/departments) stay open. Enforced in the loop (denied → error fed back, handler never runs; a gated confirmation tool is never even proposed) **and** re-checked at confirmed execution. The **deterministic report path** is gated too (members refused, guests keep demo).
- **Recall by `person_id`** — church records now store `person_id`; `member-context` and lookups query by id, name only as legacy fallback. No more same-name cross-contamination / privacy leak.
- **Paystack idempotency** — `giving_records.payment_reference` unique per workspace; a retried webhook (23505) is a no-op, not a double-count.
- **Agent audit log** — `agent_tool_audit` table; every tool call records actor/role/tool/args/outcome (`audit.ts`, best-effort).
- **Kill switch** — `workspaces.agent_mode` (full/readonly/off); read-only hides mutating tools, off pauses the agent (no fallthrough to the creator).
- Migration `20260728_security_hardening` **applied**. 276 tests pass (17 new). Stale root docs archived to `docs/archive/`.
- **Still open (Fable, lower severity):** RLS is decorative (service-role bypass — deliberate for a server-only app, now noted as such); child-release rate-limiting/lockout beyond role-gating; retiring the two-confirmation-system seam; English-only routing regex.

### Paystack real giving DONE (behind keys check, 2026-07-21)
`src/lib/services/payments/paystack.ts` — `initializeGivingPayment` (hosted payment link, amounts in kobo, metadata for the webhook) + `verifyPaystackSignature` (HMAC-SHA512). Agent tool `give_now` (`src/lib/services/agent/payment-tools.ts`) generates a member's payment link; distinct from `record_giving` (finance recording received). Webhook `src/app/api/paystack/webhook/route.ts` verifies the signature and inserts a `giving_records` row (channel `paystack`) on `charge.success`. **Inactive until `PAYSTACK_SECRET_KEY` is set** — degrades gracefully ("online giving isn't set up yet"). Routed via a give-phrasing addition to `CHURCH_ACTION_RE`. 259 tests pass. **Setup needed:** set `PAYSTACK_SECRET_KEY` in env + point a Paystack webhook at `/api/paystack/webhook`.

### CRON_SECRET set on Vercel (2026-07-21)
Linked the repo to Vercel project `idris-projects-eb8461ae/cherrt` and set `CRON_SECRET` (production, encrypted) via CLI. Goes live on the next deployment.

### Vercel Cron scaffold DONE (2026-07-21)
`vercel.json` schedules `/api/cron` daily (06:00 UTC). `src/app/api/cron/route.ts` is secret-gated (requires `Authorization: Bearer $CRON_SECRET`, fails closed if unset). `src/lib/services/cron/scheduler.ts` — `runScheduledJobs()` orchestrator; first job `deliverDiscipleshipDay()` sends each active new-convert their day-N message from `discipleship-plan.ts` (starter 7-day sequence, extend to 30) and marks the journey complete when finished. `AgentContext` gained `phone` (wired in the processor) so `enroll_discipleship` stores a reachable number. More jobs (event reminders, birthdays, missed-Sunday follow-up) plug into `runScheduledJobs`. **Same delivery caveat:** cold sends need approved templates — swap `notifyMember` for a template send. **Setup needed:** set `CRON_SECRET` in Vercel env. 248 tests pass.

### Recall layer DONE — "it remembers" (2026-07-21)
`src/lib/services/agent/member-context.ts` — `buildMemberContext(ctx)` gathers the member's recent prayer requests, open pastoral care, active life-journeys and recent giving (read-only, matched by name within the workspace) into a compact memory block, prepended to the agent's system prompt in `runAgentQuery` (best-effort, never blocks the answer). The prompt instructs the agent to follow up gently and never recite it. So the agent can say "how's your mum you asked prayer for?" naturally. 242 tests pass. **Proactive** recall (unprompted "we missed you last 3 Sundays") is the other half and needs a cron/scheduler.

### Announcements DONE (agent-native, admin-only, 2026-07-21)
New table `announcements` (migration `20260727`, applied). `src/lib/services/agent/announcement-tools.ts`: `create_announcement` (**admin-only** via `roleRank >= 4`, **confirmation-gated**, fans out to all member phones via new `listWorkspaceMemberPhones` helper, records delivered count) + `list_announcements`. **Delivery caveat (in code):** WhatsApp only allows free-form business-initiated messages inside a 24h window; cold members need a pre-approved broadcast **template** — current impl sends free-form text (reaches recently-active members, counts successes). 238 tests pass.

### Church module — CORE COMPLETE (agent-native, 2026-07-21)
Live via the agent, end-to-end over WhatsApp: giving (summary + record), prayer requests, first-timers, pastoral care, child check-in (drop-off + pickup verify + gated release), event registration, department joining, bereavement/marriage/baptism/discipleship intakes, **announcements (gated broadcast)**, members (list + assign role), facility issues, documents (gated draft). The visitor→member→volunteer→leader journeys and the whole Sunday-service loop are conversational.

**Remaining — all gated on EXTERNAL setup (not pure code):**
- **Real giving payments** — virtual account / Paystack integration (needs a payment provider + keys). The current giving *records* received money; collecting money needs this.
- **Broadcast/notification templates** — approved WhatsApp templates for reliable outbound to cold members (announcements, pastor-notify-on-new-request). Meta approval is the user's step.
- **Scheduled delivery** — discipleship daily content, event/birthday reminders, missed-Sunday follow-up ("it remembers") — needs a cron/scheduler (Vercel Cron).

### Prior milestone — Cross-branch org reporting (SHIPPED 2026-07-21, on `origin/main`)
4-task feature: org admins query combined overview/giving across all branches over WhatsApp (`matchOrgReportIntent` + `buildOrgOverviewReport`/`buildOrgGivingReport` + free-text & button dispatch). All tasks reviewed clean; final whole-branch review "ready to merge". 150/150 tests pass. Commits `0e519de..f015857`.

---

## 1. What Chertt Is (The Vision)

**Chertt is not a church management system. It's an AI church secretary living inside WhatsApp.**

The mental model: ChatGPT, but the front door is WhatsApp, and the backend does real business operations — not just generate text.

| | ChatGPT | Chertt |
|---|---|---|
| The box you type into | chat.openai.com | **WhatsApp** |
| What happens underneath | Code generation, image creation, web search | **Real operations** — invoices drafted and signed, requests approved, inventory tracked, expenses logged, giving recorded, events managed |
| The output | Text, code, images | **Confirmed actions** — "Invoice #INV-042 sent to Finance for signature" / "₦15,000 diesel expense logged" / "3 chairs remaining, reorder triggered" |

**The architecture (re-oriented):**

```
┌─────────────────────────────────────────┐
│              WHATSAPP                    │
│   Thin. Familiar. Zero learning curve.   │
│   "Draft a letter to the bank"           │
│   "Log ₦15k for diesel"                  │
│   "How many chairs in stock?"            │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│         THE BACKEND (the magic)           │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  │
│  │ AI      │  │ Workflow │  │ Module  │  │
│  │ Engine  │  │ Engine   │  │ Execs   │  │
│  │ (Gemini)│  │ (approve │  │ (4 mods)│  │
│  │         │  │  route)  │  │         │  │
│  └────┬────┘  └────┬─────┘  └────┬────┘  │
│       └────────────┼─────────────┘       │
│                    ▼                     │
│  ┌────────────────────────────────────┐  │
│  │     Supabase (all records)         │  │
│  └────────────────────────────────────┘  │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│              WHATSAPP                     │
│   "Done. Invoice #INV-042 created,       │
│    routed to Mr. Ade for signature."     │
└──────────────────────────────────────────┘
```

The web dashboard (`/w/[slug]/chat`) is a management console — not the product. The real product is a pastor messaging Chertt on WhatsApp during a service to check in a child, or a shop owner logging the day's expenses from their phone.

---

## 2. The Product — Four Modules

Built on a shared platform kernel, delivered through WhatsApp + web.

### Business Toolkit (SMEs, 5–200 staff)
Smart documents (letter/invoice drafting + signature routing), requests/approvals, inventory management, facility/issue reporting, petty cash/expense logging, polls/surveys/feedback, simple forms, appointments, FAQs, process document recall, staff onboarding, staff directory.

### ChurchBase (Churches & faith organisations)
Child check-in, giving records, event registration, first-timer capture, prayer requests, pastoral care visits, bereavement workflows, marriage prep, baptism classes, new convert discipleship, department joining, announcements, lost & found, facility issues.

### StoreFront (Small retailers)
Catalog (~20 products), chat-based order capture, invoicing & receipts, payment links, stock tracking, order management with delivery codes.

### Events (Event organisers)
Registration, paid/free ticketing, invitations & reminders, RSVP management, QR code venue check-in/access control.

---

## 3. The Users — Six Personas, One Number

The same WhatsApp line — but what each person sees is scoped to their role:

| Role | What They Do Through Chertt |
|---|---|
| **Church Member** | Give, ask questions, register, join departments, request prayer, report issues, get announcements, book appointments, receive reminders |
| **Pastor** | View reports, receive prayer requests, approve spending, assign workers, broadcast messages, check attendance, follow up visitors |
| **Church Secretary** | Register members, create announcements, manage departments, respond to FAQs, produce letters, schedule appointments |
| **Finance** | View giving, record cash, export reports, reconcile payments, approve requests within budget |
| **Children's Church** | Check children in, verify guardians, record pickups, handle emergencies, track allergies |
| **Department Leaders** | Track attendance, manage members, handle requests, run events, communicate with teams |

---

## 4. The 24 Scenarios (Problem-Driven, Not Feature-Driven)

The real question was never "what features do we build." It was: what already happens inside WhatsApp every Sunday — and what breaks because nobody's tracking it.

| # | Scenario | What Chertt Does | Problem Solved |
|---|---|---|---|
| 01 | Sunday Morning greeting | Service time, topic, preacher, directions, prayer, kids' check-in | "I forgot the time, venue, or what's happening today" |
| 02 | Running late | Notifies church, adjusts attendance count | "Nobody at the door knows who's still coming" |
| 03 | First-time visitor | QR scan or "Hi" → name, phone, birthday, who invited, transport, follow-up → pastor sees it immediately | "Someone currently carries this on paper" |
| 04 | Child check-in | Names, ages, allergies, photo, guardian → QR generated → volunteer scans at pickup | "Wrong child, missing child, unknown guardian" |
| 05 | Giving | Tithe/Offering/Building/Mission/Special Seed → pay → receipt instantly | "Missing receipts, wrong account, painful reconciliation" |
| 06 | Prayer request | Anonymous or named → sent to prayer team | "Requests getting lost or exposed" |
| 07 | Counselling | Marriage/Finance/Spiritual/Health/Business → appointment booked | "One pastor's inbox getting flooded" |
| 08 | Event registration | Adult/child? Accommodation? Transport? Food? → pay, done | "The manual spreadsheet" |
| 09 | Attendance | QR scan → logged instantly. Backup: name, phone, or 6-digit code | "Attendance breaking the moment tech fails" |
| 10 | Joining a department | Current openings, leader, rehearsal days → apply, leader approves | "Nobody remembers who applied where" |
| 11 | Announcements | Admin sends 3 → delivered, tracked, reminders offered | "WhatsApp groups turning into noise" |
| 12 | FAQs | Memory verse? Church location? Offering account? → answers directly | "The same questions, asked over and over" |
| 13 | Lost & found | Describe, photo, location → volunteer notified | "Lost items nobody's tracking" |
| 14 | Facility issue | "The toilet isn't working" → photo → maintenance notified | "Problems unreported until someone complains loudly" |
| 15 | Volunteer scheduling | "Need ushers" → asks everyone → collects responses → generates roster | "Hours spent chasing people one by one" |
| 16 | Follow-up (unprompted) | "We missed you ❤️ Need prayer, transport, or questions?" → pastor gets dashboard | "Visitor who came once and never came back" |
| 17 | Birthdays | "Happy Birthday 🎉 Would you like a pastoral visit?" | "The small human touch nobody has time to remember" |
| 18 | Bereavement | Notifies pastor, prayer team, funeral committee. Drafts announcement | "A workflow churches currently run entirely by hand" |
| 19 | Marriage prep | Premarital form, document upload, counselling booked | "An entirely manual, multi-step intake" |
| 20 | Baptism | Next class date, register, reminder, certificate when done | "Classes people forget to attend" |
| 21 | New convert | 30-day discipleship — verse + lesson daily, leader follows progress | "A decision made once, then never followed up" |
| 22 | Financial request | Purpose? Budget line? Receipt? → routed through approval chain | "Spending with no paper trail" |
| 23 | Pastoral visit | Hospital/Home/Bereavement/Birth → scheduled | "Visit requests that go nowhere" |
| 24 | Crisis/Emergency | Immediate escalation to named leader. Never counsels itself. Location sharing with consent | "A message that could save a life" |

---

## 5. The 10 WhatsApp Reality Problems

A menu-driven bot breaks the moment someone goes off-script. Chertt was designed for the messiness of real conversation:

1. **People don't follow menus** — "My son has malaria and I need the pastor" has to work like picking option 3
2. **Voice notes** — Transcribed automatically before Chertt reads them
3. **Photos** — Read, not just stored. Receipt photo → numbers pulled out → expense logged
4. **PDFs** — Parsed for data inside them
5. **People vanish mid-conversation** — Come back next week, Chertt remembers exactly where they left off
6. **Shared phone** — Husband and wife, same WhatsApp. Chertt figures out who's speaking
7. **One person, several churches** — Workspace switching happens automatically
8. **Member changes number** — Identity carries over, not lost with the old SIM
9. **Deleted WhatsApp** — Session recovers cleanly on reinstall
10. **Pastor changes** — Permissions transfer as a config update, not a support ticket

---

## 6. The Life Journeys (Not Isolated Features)

Design ChurchBase around life journeys rather than isolated features:

- Visitor → Member → Volunteer → Leader
- Prayer request → Follow-up
- Giving → Receipt → Finance
- Counselling → Appointment → Resolution
- Event registration → Attendance → Follow-up
- New convert → Discipleship → Baptism
- Child → Parent pickup

If you perfect those journeys, you solve the majority of real operational friction churches experience.

---

## 7. Memory & Context — The Biggest Opportunity

What changes Chertt from a command bot into a pastoral assistant:

- "You asked us to pray for your mum last month — how is she doing now?"
- "You requested counselling two weeks ago. Did you get to meet with Pastor John?"
- "We haven't seen you the last three Sundays. Everything okay?"
- Day 1: "Thanks for visiting." Day 3: note from pastor. Day 7: invitation back. Automatic — but never sounds automatic.

---

## 8. The Presentation: `flow.html` — Full Evolution

### v1 (original)
- Dark theme, absolute-positioned ecosystem map (broke on mobile)
- White cards on dark background
- AI-sounding copy ("One intelligent operating system connecting...")
- "Enterprise Ready — Multi-tenant architecture, role permissions, Paystack, reporting and audit logs"
- Basic demo conversations (2 exchanges)

### v2 (complete rewrite)
**UI changes:**
- Mobile-first responsive design — `clamp()` on all font sizes, `100dvh` hero, fluid padding
- Ecosystem map: desktop radial with animated dashed connector lines; mobile vertical stack
- Dark palette refined (`#0d1117` → `#0a0a0c`), glass-morphism cards (`backdrop-filter: blur`)
- Accent: `#f0812c` (warm orange)
- Scroll-triggered fade-up animations (Intersection Observer)
- SVG noise overlay with slow grain animation
- Hero entrance with staggered delays
- Hover states: nodes lift 4px with radial gradient bloom

**Voice changes (de-AI-fied):**
- Hero: "WhatsApp-first Church Operating System" → "An AI church secretary · Inside WhatsApp"
- Tagline: "One intelligent operating system connecting..." → "Your church already runs on WhatsApp. Chertt just makes it work..."
- "Enterprise Ready — Multi-tenant architecture..." → Removed entirely
- "Natural conversations become structured church operations automatically" → "Members text Chertt like they'd text anyone"
- All 24 scenario "solves" lines rewritten as human observations
- "Death" → "Bereavement", "Counseling" → "Counselling", all jargon removed

### v3 (expanded demo)
Added 9 full conversation threads under "What it feels like":
1. **Sunday Morning** — Greeting → service info → running late → child check-in with QR
2. **Prayer & Giving** — Prayer request (anonymous option) → tithe → additional offering → receipt history
3. **Operations** — Diesel expense with receipt photo → auto-balance update → recurring reminder → facility issue ticket
4. **First-time visitor** — Registration → referral tracking → follow-up request → event invitation
5. **Counselling & pastoral visits** — Sensitive intake → category routing → appointment booking → confidentiality
6. **Events & belonging** — Retreat registration (diet, transport, payment) → joining the choir
7. **Crisis** — Escalation with red-tinted bubble — instant named-leader alert, external helpline
8. **Quick answers & admin** — Account numbers, meeting times, memory verse — instant, no secretary
9. **It remembers (a month later)** — Proactive missed-Sunday check-in → recalls prayer request from a month ago → closes the loop
10. **Service reporting** — Department heads pinged after service, results roll up to pastor's dashboard
11. **Multi-tenant** — One phone, two churches, automatic disambiguation

### v4 (onboarding section)
Added "Getting started — five minutes, not five days":
- 4 numbered steps: create workspace → link WhatsApp number → invite members → members just say Hi
- Side-by-side demo: first member interaction + pastor's dashboard lighting up

### v5 (rendering fix)
Bug: Two `<style>` blocks lived inside `<body>` — some browsers (especially mobile) stop rendering. Moved all CSS into the single `<style>` block in `<head>`. Only one `<style>` tag in the entire document now.

### Deployment
- Merged root `flow.html` → `public/flow.html`, deleted root duplicate
- Committed and pushed to `main` → Vercel auto-deploys
- Live at: `cherrt.vercel.app/flow.html`

---

## 9. Technical Architecture — Current State

### Tech Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Database | Supabase (PostgreSQL + RLS + Realtime + Auth) |
| AI | Google Gemini 2.5 Flash via `@google/genai` v1.48.0 |
| WhatsApp | Meta Cloud API v19.0 (webhook, phone linking, session bridge) |
| State | React `useReducer` + Context (`AppStateProvider`) |
| Styling | Global CSS (BEM-ish, CSS custom properties for dark/light theming) |
| Data fetching | TanStack React Query (8s polling for dashboard sync) |
| Testing | Vitest (56 tests, 9 files — all passing) |
| Deployment | Vercel, auto-deploys from `main` |

### AI Execution Pipeline
```
User Message
    │
    ▼
parseCommandRequestPayload()     ← request-validator.ts
    │
    ▼
resolveCapabilityIntent()        ← intent-router.ts (keyword match against 29 capabilities)
    │
    ▼
evaluateCapabilityAccess()       ← policy-guard.ts (role-based allowlist)
    │
    ▼
runCherttCommand()               ← ai-service.ts (~1450 lines)
    │
    ├─ Gemini API key present?
    │   ├─ YES → callGemini() with SYSTEM_PROMPT + identity + history + memory → parse JSON
    │   │        → build structured result (document/request/inventory/issue/expense/poll/etc.)
    │   │        → CONFIRMATION GATE: documents, payment-links, requests≥₦50k, giving
    │   │
    │   └─ NO  → fallbackCommand() — keyword-based heuristics
    │
    ▼
normalizeAiCommandResult()       ← result-validator.ts (cleans & validates all fields)
    │
    ▼
AiCommandResult returned to caller
```

**Gemini config**: `gemini-2.5-flash`, temperature 0.5, maxOutputTokens 1200, responseMimeType `application/json`.

### WhatsApp Message Pipeline
```
Meta WhatsApp Webhook POST
    │
    ▼
Claim idempotency (whatsapp_processed_messages) — dedupe
    │
    ▼
Load session (whatsapp_sessions table + in-memory cache)
    │
    ▼
Resolve phone link (whatsapp_phone_links) — guest or workspace-linked?
    │
    ▼  (Priority order)
    ├─ Platform admin approval/rejection
    ├─ Multi-church disambiguation
    ├─ Member join-by-code
    ├─ Branch admin claim-by-code
    ├─ In-progress guided flows (signup or post-approval setup)
    ├─ Button reply (confirm/cancel/approve/reject/poll-vote/report nav)
    ├─ Help menu
    ├─ Name extraction
    ├─ Cancel, Confirm, Yes, No, Approve, Reject
    ├─ New church signup trigger
    ├─ Status command
    ├─ Org-wide reports
    ├─ Workspace reports
    ├─ Voice note → Gemini transcription → runCherttCommand
    ├─ Image → receipt detection → auto-log expense OR runCherttCommand
    ├─ Document attachment → runCherttCommand
    ├─ Text → runCherttCommand
    │
    ▼
handleAiResult()
    ├─ pendingConfirmation? → send confirmation buttons
    ├─ Workspace linked? → persistWorkspaceAiResult() to Supabase
    ├─ Guest? → deductDemoBalance()
    ├─ Generated request? → notify approver via WhatsApp
    ├─ Generated poll? → send interactive poll buttons/list
    ├─ Send formatted reply text
    └─ Circuit breaker (>3 non-actionable replies → show help menu)
```

### All 29 Capabilities in the Registry
| # | ID | Module | Status | Keywords |
|---|---|---|---|---|
| 1 | `toolkit.smart-documents` | toolkit | live | draft, letter, invoice, memo, document, signature, sign |
| 2 | `toolkit.requests-approvals` | toolkit | live | request, approval, approve, purchase, supplies, raise |
| 3 | `toolkit.inventory-management` | toolkit | live | inventory, stock, reorder, restock |
| 4 | `toolkit.issue-reporting` | toolkit | live | issue, facility, incident, repair, broken, security |
| 5 | `toolkit.polls-feedback` | toolkit | live | poll, survey, feedback, approval poll |
| 6 | `toolkit.expense-logging` | toolkit | live | expense, petty cash, receipt, fuel, diesel |
| 7 | `toolkit.simple-forms` | toolkit | live | form, questionnaire, submission |
| 8 | `toolkit.appointments` | toolkit | live | appointment, schedule, meeting, calendar |
| 9 | `toolkit.faq` | toolkit | live | faq, question, how do we |
| 10 | `toolkit.process-recall` | toolkit | live | process, policy, procedure, knowledge |
| 11 | `toolkit.staff-onboarding` | toolkit | live | onboarding, new staff, induction |
| 12 | `toolkit.staff-directory` | toolkit | live | directory, staff profile, contact, phone |
| 13 | `church.child-checkin` | church | live | child check-in, kids checkin |
| 14 | `church.giving` | church | live | giving, offering, tithe, donation |
| 15 | `church.registration` | church | live | conference registration, register attendee |
| 16 | `church.first-timer` | church | live | first timer, new guest, visitor capture |
| 17 | `church.prayer-request` | church | live | prayer request, prayer, intercession |
| 18 | `church.pastoral-care` | church | live | pastoral care, care request, pastor visit |
| 19 | `store.catalog` | store | live | catalog, product list, product |
| 20 | `store.order-capture` | store | live | order, store order, place order |
| 21 | `store.invoicing-receipts` | store | live | receipt, issue invoice, store invoice |
| 22 | `store.payment-collection` | store | live | payment link, collect payment, checkout link |
| 23 | `store.stock-tracking` | store | live | stock level, stock tracking |
| 24 | `store.order-management` | store | live | delivery code, order status, fulfillment |
| 25 | `events.registration` | events | live | event registration, register guest |
| 26 | `events.ticketing` | events | live | ticket, issue ticket, paid ticket, free ticket |
| 27 | `events.invites-reminders` | events | live | invite, invitation, send reminder |
| 28 | `events.rsvp-management` | events | live | rsvp, guest response, attendance confirmation |
| 29 | `events.guest-checkin` | events | live | qr checkin, guest checkin, access control, scan code |

### All 21 Database Tables
**Core**: `workspaces`, `memberships`, `conversations`, `messages`, `workflow_requests`, `smart_documents`
**Store**: `products`, `orders`, `payment_links`
**Events**: `event_records`, `registrations`, `check_ins`
**Toolkit runtime**: `toolkit_inventory_items`, `toolkit_issue_reports`, `toolkit_expense_entries`, `toolkit_forms`, `toolkit_feedback_polls`, `toolkit_people`, `toolkit_appointments`, `toolkit_knowledge_articles`, `toolkit_form_submissions`, `toolkit_onboarding_tracks`
**Church**: `giving_records`, `giving_categories`, `ministry_units`, `organizations`, `organization_admins`
**WhatsApp**: `whatsapp_phone_links`, `whatsapp_sessions`, `whatsapp_processed_messages`

### State Management
```
AppStateProvider (React Context + useReducer)
    │
    ├─ Initial state: seedSnapshot (100+ demo items)
    ├─ Hydration: loadWorkspaceSnapshotFromSupabase()
    ├─ Realtime: subscribeToWorkspaceSnapshot() — polls every 15s
    ├─ Reducer: 30+ actions (hydrate, approve/reject-request, add-message, apply-ai-result, etc.)
    └─ Persistence: each action calls a persist function to Supabase
```

### Onboarding Flow
**Church signup (6 steps):** Church name → branch count → main branch name → pastor name → church phone → confirmation
**Post-approval setup (7 steps):** Welcome → denomination → giving categories → service times → departments → location → completion with join code
**Web onboarding:** localStorage draft + `bootstrapWorkspaceFromDraft()` RPC call

### Environment Configuration
All keys configured in `.env.local`:
- Supabase (URL + anon key + service role)
- Gemini API key
- WhatsApp (access token + phone number ID + verify token)
- Platform admin phone for org approvals

---

## 10. What's Built vs What's Missing

### ✅ Fully Built
- AI command execution with Gemini (Toolkit module)
- Intent routing (keyword-based, 29 capabilities)
- Policy guard (role-based access)
- Request/result validation and sanitization
- WhatsApp webhook with full message processing pipeline (~950 lines)
- WhatsApp session management (in-memory + DB, cold-start survival)
- WhatsApp formatting for all 13 artifact types
- WhatsApp reports (9 types + 2 org-wide)
- Church signup onboarding flow (6+7 steps)
- Guest/demo mode with ₦500,000 balance
- Receipt OCR from photos (Gemini multimodal)
- Voice note transcription (Gemini multimodal)
- Poll voting with native WhatsApp interactive buttons
- Multi-church phone linking with disambiguation
- Organization approval/rejection with join codes
- Branch creation and admin claiming
- Supabase persistence across 21 tables (all with RLS)
- Seed data (100+ demo items)
- Workspace snapshot hydration with Supabase fallback
- Confirmation gating for documents, payment links, requests ≥ ₦50k
- Circuit breaker (>3 non-actionable replies → help menu)

### ⚠️ Gaps
- **ChurchBase/StoreFront/Events AI**: Only Toolkit module gets real Gemini calls. The other three modules use `executeNonToolkitCapability()` which creates cardboard cutout records (e.g., `buildRequest('Prayer Request', 'Pastoral Office')` instead of calling Gemini)
- **No real payment processing**: `buildGivingRecord()` generates a deterministic virtual account number — not integrated with Paystack/Flutterwave
- **Web dashboard auth not fully wired**: Supabase Auth exists but sign-in → onboarding → workspace flow needs verification
- **Profile sync gap**: WhatsApp-only users (joined via invite code) have no `auth.users` row — can't access web dashboard
- **No e-signature workflow**: `awaitingSignatureFrom` field exists but no signing flow
- **No scheduled reminders/cron**: Appointments, follow-ups need a queue system
- **No email integration**: Approval alerts, signup confirmations
- **No push notifications**: Beyond WhatsApp messages
- **Knowledge base**: Table exists but no seed data or admin UI

---

## 11. Key Architectural Decisions

1. **Chat is the only interface** — Every workflow maps to a conversation. No per-feature UIs.
2. **Capability registry over giant prompts** — Intent classification → typed tool execution → result normalization keeps the AI layer thin and the business logic testable.
3. **Client-side state + async Supabase sync** — Immediate UI responsiveness, background persistence.
4. **No topbar** — Sidebar IS the navigation. Matches Claude.ai, ChatGPT, Linear.
5. **Confirmation before consequences** — Documents, payment links, requests ≥ ₦50k, and giving all require user confirmation.
6. **WhatsApp is the product surface** — The web dashboard is the admin panel, not the product.

---

## 12. Critical Rules (Non-Negotiable)

1. **Crisis handling**: The AI never attempts to counsel a crisis itself. Escalates instantly to a named leader. Every escalation is logged.
2. **Confirmation gating**: If an action sends money or changes approval status — show a confirmation step.
3. **AI responses are formatted**: Bullet points render as bullets. Bold text renders bold. Plain text walls are not acceptable.
4. **Mobile-first**: Most Chertt users will be on phones. Every UI must work at 375px width.
5. **Action cards, not page navigation**: When AI creates something, show a compact card in the message thread. Do not navigate away from chat.

---

## 13. Immediate Next Steps

| Priority | Task | Impact |
|---|---|---|
| 🔴 P0 | Wire ChurchBase, StoreFront, Events into Gemini pipeline (remove stub gate in `runCherttCommand`) | Makes the other 3 modules actually work |
| 🔴 P0 | Integrate Paystack/Flutterwave for real payment links and giving | Unlocks StoreFront and church giving |
| 🟡 P1 | Wire web dashboard auth end-to-end (sign-in → onboarding → workspace) | Makes the web dashboard usable |
| 🟡 P1 | Profile sync between WhatsApp and web users | WhatsApp-only users can access dashboard |
| 🟢 P2 | Scheduled reminders/cron for appointments and follow-ups | Delivers on the "it remembers" promise |
| 🟢 P2 | Knowledge base seeding and admin UI | Makes FAQs and process recall actually work |
| 🟢 P3 | E-signature workflow for documents | Completes the smart documents flow |
| 🟢 P3 | Email notifications for approvals and signups | Professional communication channel |

---

*Last updated: July 21, 2026*
*Repository: github.com/idris1735/cherrt*
*Deployed: cherrt.vercel.app*
