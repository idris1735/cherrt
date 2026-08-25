# Chertt — Complete Project Chronicle

> Every conversation, decision, and discovery from July 16, 2026 onward.

---

## 0. Active Work Log (LIVING — most recent first)

**This is the single running log of what we're building and where it stands.** The numbered sections below (§1+) are the standing reference; this section is the live state. Keep it current with every meaningful step.

### 2026-08-25 — Sentence-aware church search + richer confirm

**Live-test finding:** a real user typed *"I'm unsure. But I go to daystar"* → "couldn't find that". The name search was matching the **whole sentence** literally, so "daystar" was never tried.

- **`findWorkspacesByName` is now sentence-aware:** strips filler stopwords, keeps meaningful tokens (≥3 chars, capped 5), OR-matches them (`name.ilike.%tok%`). "I go to daystar" → searches `daystar`. Falls back to the raw phrase when no usable tokens. Returns enriched rows now (id, slug, name, **city, state, username, website**).
- **Richer confirm screen:** name → *📍 city, state · 🔗 @handle · 🌐 website* → "Is this your church?" So a member picking from a name list is sure it's theirs (Kola's ask). Detail carried through code hit, single name hit, and picked list row via one `churchPatch` helper; pick list rows show city · state.
- **Tests:** +3 workspace (token OR-match, sentence extraction, all-filler guard), existing suites green. **126 flow/processor/workspace tests pass**, `tsc` 0.

**Still open (raised live):** email is captured but **not verified** — plan is async, non-blocking verification (reuse `kyc/email-otp.ts`), decision pending. And **profile beyond name+email** — progressive profiling plan, decision pending.

### 2026-08-24 — First-Contact basics: email + subscription gate (+ OneDrive corruption recovery)

**Context:** Kola sent `FirstContact.pdf` — his canonical onboarding flowchart (Welcome → Onboarding → Verify Routine). Target: match its **directness**, ours better. Decision (asked): capture email on the member rail, **no OTP loop** (WhatsApp already proves the phone); real OTP/KYC stays on the founder path. Subscription gate honored.

- **Recovery first:** the working tree had been silently overwritten by a **stale OneDrive snapshot** (flow files zeroed to 0 bytes, ~5000 lines reverted across 80 files, all stamped `Aug 23 07:18`). HEAD `e84373c` + `origin` were intact; `git stash` restored everything (corruption parked in `stash@{0}`), verified `tsc` + 121 tests. **Hazard logged** — repo lives under OneDrive-synced Desktop; recommend moving to a non-synced path.
- **`ask_email` step** in `guest_connect` (after name, before church code): one field, **Skip** always offered, lenient validation; returning/known-name members skip it — never re-asked.
- **`provisionPersonMembership`** takes optional `email` → `people.email` (fills a blank only, never clobbers).
- **Subscription gate:** `isWorkspaceSubscriptionActive(workspaceId)` — today "active" = parent org `status === "active"`, fails **open** for demo/standalone workspaces; the seam for real billing later. Checked at confirm before provisioning; inactive church → clean exit, no membership.
- **Tests:** +3 guest-connect (email captured→provisioning, bad-email reprompt, inactive-church exit); existing drives updated for the extra step. **173 tests / 17 files green** (targeted), `tsc` exit 0.

**Remaining:** founder KYC path end-to-end audit (leader → web form → Mono → approval → activation — includes the OTP/verify-routine side of Kola's flow); Phase 3 real Paystack reconciliation.

### 2026-08-21 — Rails Everywhere (Prompt 3): name search + all core tasks + AI demoted

**Brief:** `docs/prompts/2026-08-21-rails-everywhere.md` — client typed a church NAME and hit a dead end; "build everything we need, stop deferring." **706 tests / 96 files green**, typecheck + build clean. No migration.

- **A — Church-name search:** `findWorkspacesByName` (ilike, capped at 6) + new `pick_church` list step in the guest rail. The connect step is now ONE smart field: code, @username, or name; 1 name match → confirm, several → "Which church?" list, none → gentle reprompt.
- **B — Engine:** `startFlow` takes an optional `seed` so a typed "give 5000" pre-fills and is never re-asked. Nothing else changed.
- **C–F — Core member tasks on rails,** each committing through its REAL tool: `give` (amount → type → confirm → `give_now` payment link; cancel path), `prayer` (`capture_prayer_request`, name/anonymous buttons), `pastoral` (`request_pastoral_care`, category list + skip), `join` (`join_department`, Apply/Change). All guard `!ctx.link`.
- **H — AI demoted to the edges:** `MENU_FLOW` map (checkin/give/prayer/pastoral/join_dept) starts rails instead of agent prompts; a typed-intent router before the agent (seeds amounts; regex only); **`clarificationStreak` circuit-breaker deleted** (the poll write + the 3-strikes help-menu block). The agent remains the FAQ/off-script answerer — tested: "what time is service?" still reaches it.
- **Tests:** 5+4+4+5 new flow tests, name-search + pick_church tests, workspace `findWorkspacesByName` tests, 3 new processor tests; Prompt 1 + 2 suites pass unchanged.

**Manual test (Vercel Ready):** connect by name "Grace" → pick → in. Menu → Give → 5000 → Offering → ✅ → payment link; Prayer → text → anonymous → sent; Pastoral → category → Skip → "a pastor will reach out"; Join → choir → Apply. Type "give 2000 tithe" → lands on giving-type (amount pre-filled).

**Remaining:** Phase 3 Sunday & Giving (attendance, department reports, volunteer data, real Paystack reconciliation).

### 2026-08-20 — Guest → Connect-to-Church rail (Prompt 2)

**Brief:** `docs/prompts/2026-08-20-guest-connect-flow.md` — client tested Prompt 1 and "felt nothing" because child check-in is member-only; the real first impression is the guest front door, which was still the wandering bot ("Talk to a leader → wall of text"). Now the whole front door is on rails. **680 tests / 88 files green**, typecheck + build clean. No migration. Demo seeds refreshed (`GRACE001` / `COVEN002` / `DAYSTAR3`).

- **Engine (small extensions only):** `FlowRunContext.link` is now nullable (guest flows create the link on completion); new `urlButton` FlowOutput variant; child-checkin got a one-line nullable-link guard. Nothing else changed.
- **`guest_connect` flow:** consent → who are you (attend / child / leader) → name once (skipped when known) → church code or @username → "That's *Grace Chapel*, Lagos — connect you? ✅/❌" → `provisionPersonMembership` + land in the member menu list. The leader branch ends immediately with the secure web-onboarding `urlButton` (reuses `startSignupFlow`). Real lookups only: `findWorkspaceByJoinCode` / `findWorkspaceByUsername` / `provisionPersonMembership`.
- **Processor rewiring:** the in-flow advance block moved EARLIER (right after `#reset`, before join-code/admin matchers) and is now guest-capable — an active rail owns every turn for members AND guests. Consent tap, typed "I agree", and guest "menu/how does this work" all START the rail (with `sendGuestWelcome` kept as fallback). The old `guest_*` button handlers remain as dead-but-harmless code (cleanup in a later pass). The "Talk to a leader → wall of text" dead end is gone because that button no longer exists in the rail.
- **Safety order preserved:** claim → welcome/consent → risk triage → `#reset` → **flow engine** → join-code matchers → … → agent. `#reset` and `stop` still beat any flow (tested).
- **Tests:** 6 new guest-connect flow tests + 3 new processor tests; Prompt 1's child-checkin tests pass unchanged.

**Manual test (after Vercel Ready):** `#reset` → `Hi` → ✅ I agree → I attend a church → `Ada` → `GRACE001` → ✅ Yes → member menu → 👶 Check in a child → Prompt 1 rail.

**Next:** Prompt 3 — Give / Prayer / Join on the same rails + demote the AI to router-and-FAQ and remove the `clarificationStreak` breaker.

### 2026-08-20 — Flow engine + Child check-in (Prompt 1 of 2)

**Brief:** `docs/prompts/2026-08-20-flow-engine-child-checkin.md` (Kola feedback: "the bot wanders"). Architectural fix: core tasks run on deterministic state-machine rails; the LLM stays on the edges. **669 tests / 87 files green**, `npm run typecheck` + build clean, migration `20260820100000_whatsapp_sessions_active_flow` applied.

- **Generic flow engine** (`flows/engine.ts`): pure render/advance runtime — `startFlow`/`advanceFlow` with `{ to, patch } | { stay } | { done }` transitions, injected `update` (never calls WhatsApp directly), global polite cancel (`cancel/exit/quit/menu/start over`) from any step. `stop/unsubscribe` deliberately NOT engine-cancelled — those fall through to the global opt-out.
- **First flow** (`flows/child-checkin.ts`): name → age (Skip) → allergies (None) → confirm (✅/✏️) → commit via the real `check_in_child` tool (QR pass + code included). One question per turn; buttons for every choice.
- **Session:** new `activeFlow { name, step, data }` on `whatsapp_sessions` (jsonb column `active_flow`), separate from the church-setup `onboarding` union.
- **Wiring** (`whatsapp-processor.ts`): (a) mid-flow, every turn (text or button) routes to the engine — placed after all global guards (claim/welcome/risk/#reset/platform-admin/disambiguation) and before button routing + the agent; (b) `menu:checkin` starts the flow instead of feeding the agent; (c) typed "check in my child"-style intent also starts it (regex only, richer NLU is Prompt 2). Tested: menu start, mid-flow routing, mid-flow `menu` exits politely, `#reset` still wins over a flow.
- **Untouched, per spec:** Gemini agent path, guest agent, `clarificationStreak` breaker, onboarding flows, `child-tools.ts`.
- Also committed: the prompt spec + Kola's `feedback/` screenshots (16 files, ~1.9MB) for the record.

**Next:** manual WhatsApp feel-test of check-in, then Prompt 2 (Give / Prayer / Join flows + AI demotion).

### 2026-08-16 — Location data + Google Maps validation

**Brief:** owner request — prepopulated country/city options from public GitHub datasets + Google Maps address integration. **649 tests / 84 files green**, `tsc` + build clean, migration `20260816120000_location_data` applied.

- **Prepopulated location data:** `scripts/build-location-data.mjs` fetches and trims two public datasets into committed bundles — `src/lib/data/countries.json` (252 countries with dial + flag emoji, annexare/Countries) and `src/lib/data/nigeria.json` (37 states, 491 cities, dr5hn countries-states-cities-database). Regenerable; builds never touch GitHub.
- **Form:** country select (all countries, default Nigeria — non-Nigeria rejected with a clear message), state select, city select that updates per state, and an **"Other (type my town)"** escape hatch for unlisted towns. Server re-validates every value against the same datasets (country code `NG` is the canonical stored value).
- **Google Maps:** street address uses **Places Autocomplete** (Nigeria-restricted) when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set; picking a place stores `address_lat`/`address_lng` and shows "📍 Address verified on Google Maps". No key configured → graceful plain input, reviewer verifies manually. KYC review now shows the state and an "Open in Google Maps" link for verified addresses.
- **Stored:** `kyc_applications.state/address_lat/address_lng` + `workspaces.state`; approval carries state to the workspace.

**To-do (owner):** create a Google Maps key (Google Cloud Console → Places API), add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel (and `.env.local`) to light up autocomplete.

### 2026-08-16 — Owner-review P2 shipped (CAC badge, @username, website)

**Brief:** P2 from `docs/prompts/2026-08-15-owner-review-fixes.md`, one commit. **643 tests / 84 files green**, `tsc` + build clean, migration `20260816100000_p2_identity_extras` applied.

- **Live "CAC verified ✓" badge (`P2-1`):** new token-gated `POST /api/onboard/cac-verify` (Mono lookup costs money — only live form sessions, throttled 6/min/IP). The form debounces the IT/RC number and shows ✓ verified (with the registered name) / "no match — can still submit" / "unavailable". It never blocks submission; the authoritative check still runs server-side on submit.
- **@username identifier (`P2-2`):** optional on the form (3–20 `[a-z0-9_]`), uniqueness-checked against workspaces AND applications before submit; on approval it's carried to the workspace (unique-ified on clash). Members can join by it: bare `@handle` asks "Is this your church?" (same P0-2 confirm), `JOIN @handle` is instant — codes keep working (old vs new bank account numbers). Bare 8-char strings never fall back to username (2026-07-18 audit rule).
- **Website field (`P2-3`):** optional, loosely URL-validated, stored on the application and carried to the workspace at approval. Visible on the KYC review (new Church identity card) and church detail (Username/Website tiles).

### 2026-08-16 — Owner-review fixes (P0 committed early morning, P1 this evening)

**Brief:** `docs/prompts/2026-08-15-owner-review-fixes.md` (Pastor Kolawole + Isaiah review). **628 tests / 82 files green**, `tsc` + build clean, both commits pushed (auto-deploy green).

- **P0 — WhatsApp signup bugs (`423f768`):** (1) guest_member/give/ministry/code buttons now set `awaitingJoinCode`, and a bare 8-char join code matches when the session is welcoming or awaiting one (regex fixed to a capture group); (2) a bare code now resolves the church and asks **"Is this your church?"** via `join_yes`/`join_no` buttons before touching anything (`JOIN <code>` stays instant); (3) a linked member sending a pure greeting now gets "Welcome back, {name} 🙏 You're at *{workspace}*…" instead of the generic menu; (5) `#reset` wipes sender data (`demo-reset.ts` — contacts, memberships, phone links, processed messages) AND the session. Admin `/admin/churches` rows are now clickable.
- **P1 — form & product (`e231977`):** **P1-1** church phone labeled "Church WhatsApp number" + the verification code is sent to it; if it differs from the applicant's number we store `church_phone_mismatch` (yellow flag, never blocks) with a ⚠️ badge on the KYC review page. **P1-2** country select (Nigeria only, +234 phone validation) + separate City and Street address fields, stored as `city`/`country`/`address` (migration `20260816090000_onboard_location_mismatch`). **P1-3** CAC certificate is now **optional reviewer evidence** — Mono's CAC lookup needs only the RC/IT number. **P1-4** signup now sends a tappable WhatsApp URL button ("Verify my church") instead of a raw link, with graceful fallback to the plain link.

**Answer to Claude's open question (verified live):** Mono's CAC check needs only the **RC/IT number** (or legal name) — it does **not** want the certificate document. Cert upload is therefore optional reviewer evidence, which is also less data for us to hold.

**P2 shipped later the same day** — see the P2 entry above. **Phase 3 heads-up:** Sunday + Giving features per `2026-08-15` transcript.

### 2026-08-15 — Role-aware menus + department approvals with quorum

- **Role-aware tappable menus** (`37a715e`): `agent/menu.ts` — 21 curated actions across 5 groups, each row gated by the *same* `toolAccessError` as execution. Member / finance / pastor / creator / it_technical get honestly different menus; 10-row pages with "More actions →" overflow; tapping feeds a natural-language prompt through the normal guarded path. Bonus security fix the test surfaced: `list_first_timers`, `list_checked_in_children`, `list_prayer_requests`, `list_birthdays` marked `dataSensitive` — IT/technical can no longer read visitor/child PII.
- **Department approvals with quorum** (`f19ec04`): migration `20260815100000_approvals` (kind dept_join/spend/broadcast; quorum any/all/n_of_m; per-approver decisions jsonb; RLS deny-all). Pure `quorum.ts` math (any → first decides; n_of_m → requirement math; all → one decline kills) + `approvals/department.ts` (open approval, record decision, resolve membership by row id). `join_department` now opens an approval and sends leaders (rank ≥ 3) tappable **Approve/Decline buttons keyed by row id**; processor handles `approve_dept:`/`decline_dept:` → member + other leaders notified. No more "reply APPROVE and hope the AI routes it."
- **Demo-ready:** reset/seed scripts fixed (CRLF env, PostgREST filters, schema truth) and run — 3 churches live in production. **619 tests / 82 files green.** Demo run-of-show + speech: `docs/demo-presentation.md`. Architecture tree: `docs/architecture-tree.md`.

### 2026-08-14 — Governed data + AI guardrails (WS-A → WS-D → WS-B → WS-C)

**Brief:** `docs/prompts/2026-08-14-chat-attachments-governed-data-ai-guardrails.md` (Claude's direction: governed flexibility, not a blank cheque). **591 tests / 80 files green.** Migrations applied: `20260814120000_chat_attachments`, `20260814130000_pickup_safety_join_code`, `20260814140000_person_attributes`.

- **WS-A — chat attachments persist** (`d562cff`): media sent in chat no longer vanishes — downloaded from Meta, uploaded to a private `chat-attachments` bucket, row in `chat_attachments` (RLS deny-all). Voice notes keep audio AND transcript. `save_attachment` confirms what's *actually* stored (never a phantom save); `list_attachments` is leaders-only. Best-effort — never blocks the reply. Tested: store path, phantom-save refusal.
- **WS-D — pickup + join-code safety** (`673b9e3`): `lookup_child_pickup`/`release_child` throttle wrong attempts (5 in 10 min → lock, logged). **Release is guardian-gated, not code-gated**: requester's WhatsApp must match a registered guardian with `can_pickup=true` — correct code from a non-guardian is REFUSED (tested explicitly). `workspaces.join_code` is now a stored, indexed column (backfilled from the derived code, so live codes keep working); lookup is an indexed query.
- **WS-B — governed attributes bag** (`3316af1`): `person_attributes` table (RLS deny-all) + `set_person_attribute`/`get_person_attributes`. **HARD GUARDRAIL**: `SPECIAL_CATEGORIES` classifier (health/religion/ethnicity/politics/sexual orientation/biometrics) — `setAttribute` REFUSES a special fact unless `consentedSpecial === true`, then tags it `category: 'special'` (tested explicitly). Core fields stay in real typed columns; attributes are the long tail only. Persona updated.
- **WS-C — AI-power boundaries codified** (`d83162d`): `guardrails.test.ts` locks all four rails — (1) no tool name/description can ever create/alter/drop schema; (2) money (`give_now`), broadcast (`create_announcement`), child release, and special-writes are ALL `requiresConfirmation`; (3) the loop is hard-capped (`DEFAULT_MAX_STEPS` exported, bail text "please try rephrasing") — no unbounded self-prompting; (4) persona says so ("Never create or change database tables"). Confirmation is the existing pending-action flow (propose → preview → user YES).

**For Claude's audit:** WS-D — `release_child` returns "I can only release this child to their registered guardian…" when the pickup code is right but the requester has no `can_pickup` guardianship; throttling locks after 5 wrong attempts. WS-B — `setAttribute` with a health fact and no `consentedSpecial` returns the refusal and writes nothing.

### 2026-08-14 — Email channel fixed for real: Hostinger SMTP primary

- **Root cause:** Resend account was in testing mode (only the account-owner address could receive) → email codes never reached applicants. Also found the Resend SDK *returns* errors instead of throwing, so the app reported "email sent" when Resend rejected it (`47d2b0a` fix).
- **Fix (`f2cad8b`):** `email-otp.ts` now has a delivery chain — **SMTP (Hostinger `donotreply@chertt.com`) → Resend → WhatsApp** — with honest channel reporting. Live-verified: SMTP delivered a real email from `donotreply@chertt.com` (SPF already authorizes Hostinger), WhatsApp codes + church-phone ping `sent→delivered` logged, Mono NIN returned real identity data in production, full onboarding submit returned `ok:true` with `position_other` stored.
- **Production to-do (owner):** add `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USER=donotreply@chertt.com`, `SMTP_PASS=…`, `SMTP_FROM="Chertt <donotreply@chertt.com>"` in Vercel → redeploy. Optional later: verify `chertt.com` in Resend for the fallback channel.
- **Note:** owner has in-progress auth rework (untracked `src/app/auth/{create-account,modules,onboarding}`, `simple-sign-up-form.tsx`) importing a missing `@/lib/services/profile` — local tsc/build fail until that module exists; production unaffected.

### 2026-08-14 — Onboarding forms: validation, positions, third-party health

- **Email code mystery solved:** production `RESEND_API_KEY` pulls as empty locally (Vercel encryption-at-rest) and the Resend failure path was *silent* — so the WhatsApp channel always carried the demo and emails never visibly failed. `email-otp.ts` now logs missing-key warnings + full Resend errors, and the form shows exactly which channels got the code ("Email delivery is unavailable — use the WhatsApp code."). New live **Third-party connections** card in `/admin/settings` via `/api/admin/kyc-health` (platform-gated): probes Resend (verified domains), Mono (CAC probe), WhatsApp (line info) from the production runtime.
- **Validation:** NIN/BVN exactly 11 digits with live `9/11 digits` → `✓` feedback; applicant name must be first + last (trustee-match needs it); CAC IT/RC pattern; all re-checked server-side (never trust the browser).
- **Positions:** 16 options; choosing **Other** reveals a text box (required), stored as the real position (`applicant_position`, e.g. "Welfare Coordinator").
- **Denomination:** explained + common Nigerian denominations as a datalist (RCCG, Catholic, Anglican, Winners, MFM…).
- **Legit-number check:** on submit, Chertt pings the church's WhatsApp number ("✅ Chertt received your application…"); an unreachable number logs to `whatsapp_send_logs` (webhook statuses confirm delivery) and can never block the submission.
- **543 tests / 74 files, tsc clean, build compiles.**

### 2026-08-14 — Phase 1&2 checklist verified + kids-smartness + full-suite audit

- **Q1 — is the AI smart about kids?** Wiring was already live: `register_child` (child-tools.ts) is in the member-agent toolset (`CHILD_TOOLS` in runtime.ts `AGENT_TOOLS`), hard-gated on guardian consent (`guardianConsent: true` required; refuses without it; records consent `source: guardian`; links sender as primary guardian via guardianships). Claude added the persona line (`b80e570`): notice parenthood in passing, offer to register children *in that same chat* (names/ages/allergies), one after another; point young people to youth; never take a child's details from a child.
- **Q2 — Phase 1 & 2 checklist:** every bullet is built — CAC+NIN onboarding (Mono), tiered access, creator/IT roles, join-by-code/QR, multi-church, guest vs member, number migration; member + child registration, first-timers, referral-only prayer, all five pastoral forms + life journeys, department joining as a real form. Remaining gap is depth (web forms build), not features.
- **Audit results (DeepSeek, evidence-based):** WS1 never-re-ask — `getKnownProfile` + `buildKnownProfileBlock` injected at runtime.ts:265-270, `register_member` dedupe/prefill; WS3 — `assessRisk` triage at processor line ~930 *before any agent routing*, scam refused+flagged, safeguarding escalated to humans, agent never called. **534 tests / 73 files green, tsc clean.**
- **Fixed:** settings-route test mock didn't know the new `platformAdminAllowlist` export (`5fadbc8`) — now expects the merged allowlist `[env…, donotreply@chertt.com]`.
- **Ops note:** C: drive hit 0 bytes free overnight (broke a test run — looked like "73 failed, no tests", actually disk-full). User freed space; suite green again. `reset-consent-demo.sql` fixed earlier (`e72c0b4`) — `pending_agent_action` is a column on `whatsapp_sessions`, not a table.

### 2026-08-13 — Data continuity, scam sensing, tooltips, WhatsApp upgrades (WS1-WS5)

**Brief:** `docs/prompts/2026-08-13-data-continuity-scam-sensing-tooltips.md`. Built on the consent-first gate (already live). Migrations `20260813150000_flagged_messages` + `20260813160000_ws2_field_gaps` applied.

- **WS1 — never re-ask** (`74563d2`): `getKnownProfile(personId)` (identity/people.ts) assembles every stored field + memberships; injected into `AgentContext.knownProfile` and the system prompt (`buildKnownProfileBlock`) so the agent confirms instead of asking ("Still on 0803…?"). New `lookup_person` read tool lets the LLM check what's stored before asking. `register_member` dedupes existing people by name (no duplicate membership), prefills the sender's stored name/phone for self-registration, and only ever patches new fields.
- **WS3 — scam & danger sensing** (`6a24fd0`): deterministic `assessRisk(text)` (safety/risk.ts) runs BEFORE any agent routing — money-to-new-account, OTP requests, leader impersonation, phishing links → refused + warned + flagged to leaders; child danger/abuse/self-harm/threats → care reply + immediate human escalation (URGENT notifyLeaders). `flagged_messages` table (RLS deny-all) + `/admin/flagged` panel with reviewed flow. Persona hardened with scam/crisis guardrails. Processor tests prove the scam is refused and the danger escalated.
- **WS4 — tooltips** (`7f26469`): reusable `<InfoTip>` (aria-describedby, keyboard-focusable, title fallback, tap-to-toggle) on L0/L1/L2 badges, KYC chips (CAC/trustee/ID), KYC statuses.
- **WS5 — WhatsApp upgrades** (`65618ea`): webhook now handles Meta `statuses` — `recordDeliveryStatus` logs sent/delivered/read/failed into `whatsapp_send_logs` so nothing vanishes silently. Guest persona taps get tappable follow-ups: member → Give · Prayer · Join a ministry; child → Send my code · Talk to a leader.
- **WS2 — full field set** (`7460b79`): member (+occupation, +emergency_contact), first-timer (+how_heard, +address), leader/volunteer (+skills, +availability on department_memberships), child (+birthdate on person, +who_may_collect on child_profiles — can_pickup already modelled via guardianships). All captured by the existing WhatsApp tools, nothing dropped.

**532 tests (+37), tsc clean, build compiles.** Owner action: run the TRUNCATE SQL in the Supabase editor (resets everyone to first contact → fresh consent gate, cleared AI memory).

### 2026-08-13 — built-in admin + demo reset script

- `donotreply@chertt.com` is now a **built-in platform admin** in `kyc/admin-auth.ts` (`BUILT_IN_ADMIN_EMAILS`, merged + deduped with `PLATFORM_ADMIN_EMAILS` via `platformAdminAllowlist()`) — it can open the admin dashboard automatically with no env-var change. Settings API now reports the merged list.
- Manual ops script `supabase/reset-consent-demo.sql` (outside `migrations/`, so `db push` ignores it): nulls everyone's consent stamp → consent gate re-asks on next contact, and clears `whatsapp_sessions` / `whatsapp_processed_messages` / `otp_challenges` / `pending_agent_action` for a clean demo. Run it in the Supabase SQL editor.

### 2026-08-13 — Kimi dashboard integrated into /admin (reskin + rewire, all steps shipped)

**Brief:** `docs/prompts/2026-08-13-deepseek-integrate-kimi-dashboard.md` + `docs/design/kimi-dashboard.html`. Kimi produced a self-contained HTML design; DeepSeek reskinned the real console to it and rewired every screen to live queries. **Zero Kimi sample data survived** (grep-verified: no `DATA`, names, Unsplash URLs, or hardcoded consent dots in `src/`).

- **Step 0** (`d6e0867`): design saved to `docs/design/kimi-dashboard.html`.
- **Step 1 — theme** (`3fb5871`): Kimi's full token set added to `globals.css` (`--surface-elevated`, `--muted-light`, `--line-strong`, `--accent-hover`, success/warning/danger/info ± soft, `--font-mono`, sidebar/topbar/transition tokens, shadows); **theme standardized on `html[data-theme]`** (toggle + FOUC preloader + charts observer + all public-page dark selectors migrated, `prefers-color-scheme` fallback kept). No second theme system remains.
- **Step 2 — CSS kit** (`a1b4100`): Kimi's styles ported to a global `src/components/admin/admin.css` (element selectors scoped under `.app` so public pages are untouched; tokens referenced, no raw hex); retired `admin-kit.module.css`.
- **Step 3 — shell** (`a1b4100`): Sidebar (grouped nav + pending-KYC badge + real email initials), Topbar (⌘K trigger, bell with real pending count, theme toggle, avatar menu → sign out), command palette → debounced `/api/admin/search`, toast host + confirm dialog + photo-zoom modal as React components. Identity = real Supabase session email.
- **Step 4a — overview + churches** (`efde7c0`): Command Center with 5 KPI cards (value + real delta vs previous window + real sparkline series), growth/giving recharts, funnel, donut, attention panel, activity feed (real `activityFeed`), period switcher. Churches list (search/sort/filter) + tabbed detail with per-church recharts.
- **Step 4b — people** (`58bc005`): directory reskinned; profile right rail now shows **REAL consent state** — lawful basis (`consent_source`), version, and opt-out (`phone_contacts.opted_out`) via extended `getPersonDetail` (new `phones` + `consent` fields, TDD'd).
- **Step 4c — KYC** (`9adde81`): pipeline board with the **real four statuses** (Pending · Draft · Approved · Rejected — `needs_info` isn't a real status, collapsed into draft); chips from real `cac_result`/`id_result`/`trustee_match`; review screen with real signed-URL documents (no Unsplash), Kimi confirm dialogs + toasts, Approve/Reject POST unchanged.
- **Step 4d — data requests + settings** (`c8ae076`): new `/admin/data-requests` (real kinds access/deletion/objection; "Mark done" → real POST) + `/admin/settings` (read-only real `PLATFORM_ADMIN_EMAILS` allowlist + theme toggle); new gated routes `GET /api/admin/data-requests` (`?all=1` includes done) and `GET /api/admin/settings` (TDD'd).

**495 tests (+7), tsc clean, build compiles.**

### 2026-08-13 — Rich, interactive admin dashboard upgrade (all 6 slices shipped)

**Brief:** `docs/prompts/2026-08-13-dashboard-rich-upgrade.md`. Non-negotiable: NO mock data — every chart/KPI/sparkline traces to a real query. `recharts` installed; inline SVG sparklines; everything on `admin-kit.module.css`; all routes allowlist-gated.

**Slice 1 — data layer (commit `0a6132e`, TDD, 18 new tests in `foundation.analytics.test.ts`):** `platformTrends(period)` (day buckets 7d/30d, week buckets 90d/all — fed by organizations/branch_memberships/giving_records), `kycFunnel()`, `verificationBreakdown()` (L2 = onboarding-form consent stamp = Mono-verified people), `givingTrend(period, churchId?)`, `memberTrend(period, churchId?)`, `churchStats(id)`, `activityFeed(limit)` (unified KYC/org/member/first-timer/data-request events with drill links), `adminSearch(q)`, `platformOverview(period, now)` extended with `kpis` (value + delta vs previous window + spark). Routes: `/api/admin/overview?period=` extended; new `GET /api/admin/churches/[id]/stats`; new `GET /api/admin/search`.

**Slice 2 — overview command center (commit `3364295`):** `/admin` rebuilt — KPI row (sparklines + ▲/▼ deltas, click-through), attention panel (pending KYC / data requests / unverified churches), growth (area) + giving (bar) charts, KYC funnel (horizontal bars), verification donut, live activity feed, 7d/30d/90d/all period switcher re-querying everything. `charts.tsx` reads CSS tokens live (light+dark via MutationObserver); admin tokens now remapped under `html[data-chertt-theme="dark"]`.

**Slice 3 — churches (commit `48a0474`):** list with search/filter/7 sortable columns incl. giving + verified % (`listChurches` extended, batched queries); tabbed detail — Overview (stats + giving trend + member growth via `/stats`), Members (searchable), Children, Branches, Pastoral (care rows + form submissions), KYC.

**Slice 4 — people (commit `19a9656`):** directory with name/phone search + verification/membership filters; profile with tabs — Timeline (icons, vertical line), Memberships, Family (guardian-of AND guardians — `getPersonDetail` extended with prayer/data/giving/guardians), Requests (pastoral + prayer + privacy), Giving (records + total). Consent source/version shown.

**Slice 5 — KYC pipeline (commit `a189f9d`):** `listAllApplications()` serves all stages; `/admin/kyc` is a 4-column board (Pending · Needs info · Approved · Rejected) with CAC/trustee/ID result chips per card + reject reasons; review screen kept.

**Slice 6 — interactivity (commit `cc5e765`):** collapsible desktop sidebar + mobile drawer (hamburger in topbar), ⌘K/Ctrl+K command palette jumping to any church/person (debounced `/api/admin/search`), breadcrumbs on all detail pages, `:focus-visible` + `prefers-reduced-motion` respected, responsive grids at 768px, retired dead `admin-nav.tsx` + `admin.module.css`.

**488 tests (+25), tsc clean, build compiles.** Per-visual data provenance (for Claude's review): KPI values/deltas/sparks ← `platformOverview.kpis` ← platformTrends (orgs/memberships/giving tables); growth chart ← `platformTrends`; giving chart ← `givingTrend`; funnel ← `kycFunnel` ← kyc_applications.status; donut ← `verificationBreakdown` ← phone_contacts.verified_at + people.consent_source; feed ← `activityFeed` (kyc_applications/organizations/branch_memberships/first_timers/data_requests); church charts ← `/churches/[id]/stats` (givingTrend + memberTrend scoped via workspaces.organization_id); KYC chips ← cac_result/id_result/trustee_match payloads.

### 2026-08-13 — Consent & Privacy Layer (NDPR) — all 5 slices shipped

**Brief:** `docs/prompts/2026-08-13-consent-privacy-layer.md`. Every path that writes a person/personal record must have a recorded lawful basis; children always guardian-consented; opted-out numbers never messaged; consent is versioned.

- **Slice A — data model + service (commit `06363ee`):** migration `20260813140000_consent_privacy_layer.sql` — `people.consent_at/consent_version/consent_source`, `phone_contacts.opted_out/opted_out_at`, new `data_requests` table (kind: access/deletion/objection, status open/done). `src/lib/services/privacy/consent.ts`: `recordConsent`, `isOptedOut`, `setOptedOut`, `clearOptOut`, `logDataRequest`, `CONSENT_VERSION="2026-08-13-v1"`.
- **Slice B — opt-out suppression (commit `06363ee`):** `postToGraph` never messages an opted-out number (fail-open if lookup unavailable). STOP handler confirms FIRST then `setOptedOut` + logs a deletion request. Every inbound message clears opt-out. Guest button taps record `whatsapp_first_contact`.
- **Slice C — lawful basis everywhere (commit `e47cf6b`):** `recordConsent` on prayer_request, first_timer_capture, leader_registered, pastoral_form, department_join; `approveKycApplication` records `onboarding_form` on the provisioned person.
- **Slice D — guardian consent for children (commit `e47cf6b`):** `register_child` refuses without `guardianConsent: true`, records consent on the child with `guardianPersonId` linked, refuses if sender identity is unknown.
- **Slice E — transparency + rights (commit `dc8bb89`):** registering/capturing someone ELSE's phone sends them a notice ("Reply privacy… or stop to opt out"). New `/privacy` page (static, design-kit styled) linked from onboarding form + WhatsApp privacy reply. `delete my data` logs a deletion request. Open `data_requests` surface in `/admin` overview with a Done action (`POST /api/admin/data-requests/[id]`, platform-gated).

**463 tests (+16), tsc clean, build compiles.**

### 2026-08-13 — DEMO-DAY WAR PLAN executed: P0 (6/6) + P1 (5/5) + P2 (2/4)

**Brief:** `docs/prompts/2026-08-13-DEMO-DAY-warplan.md`. Serious client demo today. Executed strictly in tier order.

**P0 — the loop cannot break (ALL shipped, commit `35f189a`):**
- **P0-1 OTP dual-channel:** `sendOnboardingOtp(email, phone)` — code goes to email AND WhatsApp. Missing RESEND_API_KEY can never block onboarding. Test proves WhatsApp delivery with Resend unset.
- **P0-2 template fallback:** `templateOrText` in whatsapp-templates — every business-initiated message falls back to plain text (delivers inside the 24h window). notifyLeaders logs per-send outcomes.
- **P0-3 submit can't hard-fail:** `runKycChecks` guards each Mono call (throws → "errored" results); submit route catches anything and ALWAYS reaches `pending`. Tests prove Mono-down still queues.
- **P0-4 review screen survives any data:** guarded signed URLs + `cacCertUrl`; CAC/trustee/ID status chips; 3-photo compare (selfie/NIN/CAC-cert) with click-to-zoom.
- **P0-5 opener polish:** warm guest welcome; unmistakable "🔒 Tap to verify your church securely" link.
- **P0-6:** `npm run reset-demo` — FK-safe multi-pass wipe + kyc bucket.

**P1 — launch look (ALL shipped, commit `3705980`):**
- P1-7 approve-confirm modal on the KYC review screen. P1-8 WhatsApp copy pass (welcome, tiered refusals). P1-9 console empty states. P1-10 onboarding form: live phone/NIN digit grouping, autofocus, Church→You→Verify chips, submit disabled until complete with missing-list hint. P1-11 branded sign-in.

**P2 stretch (2 of 4, commit `c8787f6`):**
- P2-14 `npm run seed-demo` — one approved church + members + child + first-timer + milestones + giving (owner-triggered only). P2-15 `whatsapp_send_logs` — failed sends logged, never silent. P2-12/13 (child/member tokenized web forms) deferred — beyond the stretch target.

**447 tests, tsc clean, build compiles, all migrations applied.** Owner actions still required (env): WhatsApp number live, Mono keys, PLATFORM_ADMIN_EMAILS + Supabase login, NEXT_PUBLIC_APP_URL.

### 2026-08-12 — Phase 2 completion + sign-in fix (Claude review bundle)

**Brief:** `docs/prompts/2026-08-12-signin-fix-and-phase2-finish.md`

**Part A — sign-in fix (already largely in place from web rebuild):**
- **Review-critical regression test added** (`sign-in-form.test.tsx`): seeds stale `lastWorkspaceSlug` + onboarding-draft in localStorage (the exact failure mode Claude found) and asserts sign-in lands on `/admin` — never `/w/*` or `/auth/setup`. Plus wrong-credentials mapping + invalid-email blocking.
- Pruned `profile.ts` (only referenced by the deleted sign-up form). `onboarding-draft.ts` kept — `slugifyWorkspaceName` still used by kyc/review + whatsapp-workspace.

**Part B — Phase 2 finish (visible in /admin):**
- **B1:** `getChurchDetail` extended — member rows carry richer profile (gender/birthdate/email/maritalStatus), plus `children` section (child_profiles + guardianships with guardian names) and `pastoralRequests` summary. New `getPersonDetail(personId)` → person + memberships + milestones + guardianOf + pastoralRequests. 5 new tests.
- **B2:** `GET /api/admin/people/[id]` (gated) + `/admin/people/[id]` page — profile card, vertical milestone timeline, memberships, guardian-of children, pastoral requests. `/admin/people` rows now link to detail. Church-detail page shows richer members + children list.
- **B3:** `src/lib/services/church/milestones.ts::recordMilestone` + auto-emit — `convert_first_timer` → `joined_membership`; `update_pastoral_form_status` → completed dedication/naming form → `child_dedication`. **4 tests assert the milestone insert actually fires** (and does NOT fire for non-dedication forms or non-completed statuses).
- **B4:** `submit_pastoral_form` uses `ensurePerson` — unlinked submitters still link to a real person.

**436 tests pass (+12 from 424), tsc clean, build compiles. No new migrations.**

### 2026-08-12 — Web rebuild: professional admin dashboard (Slices 1-4)

**Brief:** `docs/prompts/2026-08-12-web-rebuild.md`. The web app is being rebuilt as a professional admin-only dashboard. WhatsApp is the product; web is the control room. Parallel track — does not block the pastor demo.

**Slice 1 (design kit + shell):** New `src/components/admin/admin-kit.module.css` — a proper component kit on `:root` tokens (Sidebar, TopBar, Card, StatCard, Table, Badge, Button, Input, EmptyState, Skeleton). Light + dark via `[data-chertt-theme]`. Responsive (sidebar collapses on mobile). `AdminShell` wraps every dashboard page.

**Slice 2 (auth):** Sign-in page (minimal centered card) → on success lands on `/admin`. Platform-admin check via `platformAdminEmail`; non-admins get "not authorized." Onboarding redirect removed.

**Slices 3-4 (admin pages):** Overview (stat cards + recent activity), Churches list + detail (members, roles, verification levels), KYC list + review detail (selfie beside Mono ID photo, approve/reject) — all restyled to the new kit. Skeleton loading, error states, semantic badges.

**Remaining:** Slice 5 (People view + API), Slice 6 (teardown legacy /w/* + old auth + demo data), Slice 7 (restyle /onboard/[token]). 414 tests pass, tsc clean, build compiles.

### 2026-08-11 — First-contact UX overhaul + DB reset for demo prep
- **DB fully wiped:** 231 rows across all 17 tables cleared (people, orgs, workspaces, giving, prayers, sessions, etc.) — clean slate for the pastor demo.
- **Guest welcome now has tappable buttons** (was bare text): "Set up my church" · "I have a church code" · "What can you do?" — no more guessing what to type. Falls back to plain text if interactive messaging fails.
- **Main menu expanded from 5 to 10 items:** Give · Prayer · Check-in · First-timer · Join ministry · Events · Record service · Giving report · Church overview · More help →. Full WhatsApp list-picker limit used.
- **Help text enhanced** — now 10 lines covering all major actions (give, prayer, first-timer, kids, belong, events, service recording, reports, more).
- **New button guides:** first-timer, join ministry, events, service recording — each gets a contextual guide. "More help →" re-opens the full help menu.
- **Guest buttons wired:** tapping "Set up my church" triggers the signup flow; "I have a code" prompts for the code; "What can you do?" opens the help menu.
- **414 tests pass, tsc clean, build compiles.** No new migrations.

### The roadmap (the "magic backend"), in dependency order
WhatsApp is the product; the web app is an internal admin console only (confirmed 2026-07-21). The backend must run the whole business end-to-end with zero reliance on any web UI. Subsystems, foundation-first:

1. **Identity & Tenancy Spine** ← *in progress* — who is speaking, which branch, what role/authority.
2. **Roles & Authority** — folded into #1 (curated per-vertical role catalog → capability bundles).
3. **Onboarding & Provisioning** — folded into #1 (person/role-aware).
4. **Agentic Engine** — single-shot classifier → real tool-calling agent ("the crazy work rate"). *✓ church module CORE COMPLETE — agent is the primary church handler (creator is fallback). Remaining church items are gated on external setup: payments, WhatsApp templates, cron.*
5. **Workflow Engine** — approvals, routing, multi-step life-journeys as state machines.
6. **Memory & Context** — the "it remembers" layer. *← recall DONE; proactive/scheduled cron scaffold DONE (daily discipleship live; more jobs pluggable).*
7. **Capabilities & infra** — church executors ✓, cron ✓, **payments (Paystack) ✓ behind keys check**; Store/Events still on the old creator; approved WhatsApp templates still pending (external).

### 2026-08-09 — Phase 1 Slice 3: Platform-Admin Foundation Console (SHIPPED) — PHASE 1 COMPLETE
**Spec:** `docs/superpowers/specs/2026-08-09-admin-foundation-console-design.md` · **Plan:** `plans/2026-08-09-admin-foundation-console.md` · **Merged `d40342d`.**
Kola's ask — an admin dashboard that makes the foundation visible ("magic backend" console; web = admin-only).
- **Foundation service** (`src/lib/services/admin/foundation.ts`, service-role reads): `platformOverview` (church/member/verified counts + recent KYC/churches), `listChurches` (branch + member counts), `getChurchDetail` (org + workspaces + members with role & `verificationLevel` L0/L1/L2 + linked KYC).
- **Gated routes** (`platformAdminEmail`): `GET /api/admin/overview`, `/api/admin/churches`, `/api/admin/churches/[id]`.
- **Console pages** (`/admin` overview, `/admin/churches` list, `/admin/churches/[id]` detail) + shared `/admin` layout/nav (Overview · Churches · KYC).
- **Design:** Vercel-minimal LIGHT, built on the existing `globals.css` `:root` tokens (`--bg`/`--surface`/`--ink`/`--muted`/`--line`/`--accent`, hairline borders, ~10px radii, orange only on primary/active). Shared `admin.module.css` kit. **The dark-green inline UI on the KYC + onboard pages was scrapped and restyled to the kit** (owner: "scrap the entire ui of the previous thing… proper Vercel-like dashboard"). **409 tests, typecheck + build clean.**
- **✅ PHASE 1 (Foundation: Church & Identity) COMPLETE:** identity+OTP (Slice 1), creator/IT roles, admin-assigned roles, CAC+NIN KYC + tiered access + review dashboard + approval (Slice 2), multi-church disambiguation, guest vs member, number-migration, and now the visible admin foundation console (Slice 3). **Next: Phase 2 — People & Pastoral Care** (member/children registration, first-timers, prayer referral, pastoral care + forms, life journeys, join department) — pending owner Saturday validation. OPEN foundational decisions still unresolved (data ownership, WhatsApp billing/templates, own-number-vs-shared).

### 2026-08-09 — Phase 1 Slice 2: Church KYC onboarding (Plans 1 & 2 SHIPPED)
Post owner-review (Kola + Isaiah): demo eradicated; foundation-first, module-by-module. **Slice 1 (Identity Foundation)** shipped 2026-08-08 (commit `82809e7`): `creator`/`it_technical` roles, `foundingAdminRole("church")=creator`, `it_technical` denied on data-sensitive tools, inbound-WhatsApp = verified person (L1), OTP-over-WhatsApp step-up + number migration, all demo code removed.

**Slice 2 = production KYC** ("think Nigerian, think production" — Kola). Nigerian churches register as **Incorporated Trustees (IT)** under CAMA Part F. Liveness provider skipped (cost) → manual selfie-vs-NIN-photo compare + "selfie holding ID".
- **Spec:** `docs/superpowers/specs/2026-08-09-church-kyc-onboarding-design.md`. **Plans:** `plans/2026-08-09-kyc-verification-engine.md` (P1), `plans/2026-08-09-kyc-web-form.md` (P2).
- **Plan 1 — KYC engine (merged `cef61c6`):** Mono lookup client (CAC/IT + trustees + NIN-with-photo, `src/lib/services/kyc/mono.ts`), `kyc_applications` table (RLS deny-all), tokenized draft service (`applications.ts`), trustee anti-hijack name-match (`trustee-match.ts`), `runKycChecks` orchestrator.
- **Plan 2 — web intake (merged `03c60c8`):** email OTP via **Resend** (reuses `otp_challenges`, `purpose='email'`), **private `kyc` storage bucket** + signed-URL helpers, `/onboard/[token]` page + client form (church + IT# + NIN/BVN + email verify + selfie + consent), `POST /api/onboard/email-code` + `POST /api/onboard/submit` (verify → store selfie → `runKycChecks` → status `pending`). **385 tests, typecheck + build clean.**
- **Plan 3 — review dashboard (merged `7a8da6d`):** `/admin/kyc` list + `/admin/kyc/[id]` detail (client pages) reading the Supabase session JWT; enforcement server-side in `/api/admin/kyc` + `/api/admin/kyc/[id]` via `platformAdminEmail` (checks `PLATFORM_ADMIN_EMAILS` allowlist). Review service (`kyc/review.ts`): list pending, detail with **signed selfie URL beside the Mono NIN photo** (data URL) for manual liveness compare, **approve** (creates org+workspace mirroring `approveOrganization`, seats applicant as `creator` via `provisionPersonMembership`, `sendOrgApprovedTemplate`) / **reject** (reason + `sendOrgRejectedTemplate`) — idempotent (pending-only), notify best-effort. **395 tests, build clean.**
- **Env / keys:** Mono **sandbox** key + `RESEND_API_KEY` + `PLATFORM_ADMIN_EMAILS` (=anonymousway001@gmail.com) in local `.env.local` (dev). For Vercel prod: **live** Mono keys, `RESEND_API_KEY`, `PLATFORM_ADMIN_EMAILS`, and a real `OTP_PEPPER` — all still to be set (owner action). The reviewer must have a Supabase-auth account whose email is on the allowlist.
- **Plan 4 — connect + tiered (merged `9bc96f7`):** `startSignupFlow` now calls `startApplication` and texts the `${NEXT_PUBLIC_APP_URL}/onboard/{token}` link instead of collecting church details in chat (old in-chat pending-org signup retired; `advanceSignupFlow` kept for in-flight sessions). `approveKycApplication` seeds `startSetupFlow` so the newly-approved creator's next WhatsApp message resumes post-approval setup (giving categories → ministries → branches). `kyc/tiered-access.ts::churchApproved(workspaceId)` (org `active`; fail-open on no-org/errors) gates `record_giving` + `add_member`. **403 tests, typecheck + build clean.**
- **✅ Slice 2 COMPLETE end-to-end:** WhatsApp "set up my church" → web `/onboard/[token]` form (email OTP + selfie + consent) → `runKycChecks` (Mono CAC/trustee/NIN) → `/admin/kyc` review (selfie vs ID photo) → approve (creates church, seats creator, WhatsApp-notifies, resumes setup) / reject (reason + notify) → tiered access until approved. **Next: Phase 1 Slice 3** (per `phase_plan` — or owner's Saturday validation).
- **Prod env still to set in Vercel (owner):** live Mono keys, `RESEND_API_KEY`, `PLATFORM_ADMIN_EMAILS`, real `OTP_PEPPER`, `NEXT_PUBLIC_APP_URL` (real domain for the onboard links). Approved WhatsApp templates (`chertt_org_approved`/`chertt_org_rejected`) must exist for approve/reject notifications.

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

### Demo-readiness fixes (Fable go-live review, 2026-07-23)
Fable reviewed the live WhatsApp demo experience — verdict "will wow, with one landmine." Fixed the landmine + rough edges:
- **HIGH: stale SME help menu.** `buildHelpText`/`sendHelpMenu`/`handleHelpButton` (`whatsapp-processor.ts`) still showed pre-church copy ("Request ₦85k for diesel", "letter to the landlord", office supplies) and fired on the broad `HELP_RE` ("help", "menu", "how do I use this", "not sure"…) for everyone incl. linked members — the wrong-product moment a first-time tester would hit. Rewritten church-focused (give / prayer / first-timer / kids / belong / leaders); buttons now Give / Prayer / Check-in with church guides.
- **MEDIUM: `status`/`summary`/`dashboard`** showed the old toolkit status (expenses/inventory/demo-balance). Rewritten to a church "at a glance" (pending approvals + open issues, else "all clear"); guest branch points to onboarding.
- **LOW:** `release_child` param description "4-digit" → "6-digit". A seeded demo church ("Grace Chapel (Demo)") links the owner's number as senior_pastor (rank 6 clears every gate), and the demo session is reset so the welcome fires fresh. 328 tests pass.

### Demo payments — see the giving flow end-to-end, no keys (2026-07-23)
So the give-now experience can be seen before real Paystack keys exist. `give_now` now: if `paystackConfigured()` → real Paystack (unchanged); else → **demo flow** (`startDemoGiving`): inserts a pending `demo_payments` row (migration `20260802`, applied) and returns a link to a **church-branded checkout page** `src/app/pay/[reference]/page.tsx`. Tapping "Pay securely" POSTs to `src/app/api/pay/complete/route.ts`, which marks it paid, **records a real `giving_records` row** (channel `demo`, idempotent on the reference) and sends the donor a **WhatsApp receipt**, then shows the "received" state. So: WhatsApp → link → branded checkout → pay → recorded + receipt → shows up in giving summaries. Flips to real Paystack automatically once `PAYSTACK_SECRET_KEY` is set. 328 tests pass.

### Number migration flow — admin-assisted re-attach (2026-07-23)
The last "partial" AI capability from the client overview, now built. Because identity is person-centric, the re-attach is trivial: `migratePersonPhone(personId, newPhone)` (`provisioning.ts`) retires the person's active `phone_contact`, adds the new one active, resyncs legacy `phone_links` — refuses if the new number is already active for someone else (no hijack). Flow: a guest whose number changed files `request_number_migration` (name + OLD number; the guest agent now carries this one tool + the sender's phone) → the old number resolves the person + church precisely → a `number_migration_requests` row (migration `20260801`, applied). A church admin (minRank 4) uses `list_migration_requests` / `approve_number_migration` (code-based, workspace-scoped) / `reject_number_migration`; approval runs the re-attach and welcomes the member back. Two-factor by design: knowing the old number + a church admin who knows them. `audit.ts` now skips the workspace-less guest path. 328 tests pass (7 new). **Every AI capability in the client overview is now built.**

### Remaining ChurchBase scenarios pack (2026-07-23)
Closes the last scenario gaps from the client overview. Migration `20260731` (applied) adds `people.birth_day/birth_month`, `volunteer_needs`, `volunteer_signups`, `lost_found_items`, `office_guests`. Tools:
- **Birthdays** (`birthday-tools.ts`): `set_birthday` (member), `list_birthdays` (leaders, today/week/month) + cron `sendBirthdayGreetings` (daily greeting to today's celebrants via their person→phone_contacts).
- **Volunteer scheduling** (`volunteer-tools.ts`): `request_volunteers` (dept lead), `list_volunteer_needs` + `volunteer_signup` (members), `get_volunteer_roster` (leaders). Broadcast reuses announcements.
- **Front desk** (`helpdesk-tools.ts`): `report_lost_or_found` + `list_lost_found` (members); office guest sign-in — `register_office_guest` (returns a 6-digit code), `sign_out_office_guest`, `list_office_guests` (secretary/reception).
- **FAQ** (`faq-tools.ts`, reuses `toolkit_knowledge_articles`): `add_faq` (admins teach church facts), `get_faq` (agent looks up before guessing a church-specific fact; topic sanitized before the PostgREST or-filter).
All role-gated + audited. 321 tests pass (18 new). **ChurchBase scenario coverage is now complete** — every one of the 24 in the client overview is built (crisis escalation & pastoral visits handled via existing pastoral-care/crisis paths).

### Sunday Operations pack — attendance, service summary, department roll-up (2026-07-23)
Closes the ChurchBase gaps in the "Sunday Operations" + "Church Intelligence" pillars (scenarios 1, 2, 24) that a client overview flagged. New tables `services` / `service_reports` / `service_attendance` (migration `20260730`, applied). Tools in `src/lib/services/agent/sunday-tools.ts`:
- `record_service_summary` (secretary/pastor, minRank 2) — attendance (adults+children), first-timers, salvations, preacher, topic, start/end times, offering, notes; find-or-creates the day's service and fills whatever's mentioned (call again to add more).
- `mark_attendance` (member self-service) — "I'm here" → per-member attendance for today's service (dedup'd).
- `submit_service_report` (dept_leader+, minRank 1) — department heads file their counts, rolling up to the pastor.
- `get_service_summary` (leaders, minRank 2) — the full roll-up: summary + department reports (totalled) + real children-checked-in count (pulled live from `child_checkins`) + self-check-ins.
- `list_recent_services` (leaders) — recent headline numbers for trends.
All role-gated + audited like the rest. 303 tests pass (10 new). **Decision noted:** kept the one-shared-number model (not per-church WhatsApp numbers) — switching would mean per-church Meta setup + webhook routing, a big lift for little gain; revisit as a premium option later.

### FIX: guests were meeting the OLD SME bot (2026-07-23)
A real WhatsApp transcript exposed that anyone messaging the number as a **guest** (not linked to a church) got the *old single-shot creator* with its stale SME voice — "I help organizations with administrative/financial/operational tasks", listing "modules" (Documents, Finance, Operations, Store…), suggesting "log an expense / draft a letter", pushing the web sign-in. The new church Chertt (persona + tools) only ever ran for *linked members*, so the first thing every stranger saw was the wrong bot. Fixed:
- **Guest agent** (`runGuestAgent` + `GUEST_PERSONA`, tool-less): the church-focused Chertt voice that warmly explains what she is and guides onboarding — "reply *set up my church*" or "send your church's code". Explicitly forbids the SME framing/modules/web-signup. Guest free-text now routes here (creator only as a no-Gemini fallback).
- **Welcome messages rewritten**: `buildGuestWelcome` (church intro + the two onboarding paths, no demo-balance/SME examples/sign-in link) and `buildWorkspaceWelcome` (short, human, church-focused — "give, ask for prayer, register, check a child in"). 293 tests pass. **Deploys on push.**

### Chatbot personality — human, funny, per-church configurable (2026-07-22)
`src/lib/services/agent/persona.ts` — `AGENT_PERSONA` is now a crafted, deliberately **non-AI** voice: Chertt is "the church's person on WhatsApp" (not a bot/assistant/menu) — direct, brief, non-redundant, a quick sense of humour when the moment's light, Nigerian English + Pidgin. She **knows the product and nudges engagement** like a warm marketer ("youth night Friday, want a seat?", "choir needs altos, that's you 👀") — never pushy. Tone reads the moment (everyday=quick, tender=gentle no-jokes, finance=precise).
- **Safety baked in + test-locked** (`persona.test.ts`): honesty (never invent), confidentiality, confirmation before consequential actions, and crisis handling (don't counsel, urge 112/help, log 'crisis' pastoral-care for urgent follow-up).
- **Per-church configurable**: `composeSystemPrompt(churchPersona, memory)` layers a church's own style note (`workspaces.agent_persona`, migration `20260729`, applied) on top of the base — flavour only, never overrides the safety rules. Admins set it conversationally via the `set_church_personality` tool (admin-gated, minRank 4; "reset" reverts). 291 tests pass.

### Multimodal agent — sees images, hears voice, reads docs (2026-07-22)
`runAgentLoop`/`runAgentQuery` accept `media` (`MediaPart[]`) attached to the first turn (`inlineData`), so the agent is multimodal. In the processor, a linked member's **image/voice/document** now routes to the agent: images (e.g. a receipt → the agent reads the amount and calls `log_expense` **if they're finance** — the gating carries over), voice (transcribed → agent), documents (→ agent). Shared `dispatchToAgent`/`agentCtx` helpers DRY the text + media paths. The single-shot **creator is now reached only for guests (demo mode) and the no-Gemini fallback** — for a linked church member the agent handles everything (text + media), so the two-confirmation seam is effectively collapsed for real members. (Full creator deletion still waits on the guest/demo path.) 279 tests pass.

### Agent is now primary for ALL church text (2026-07-22)
The agent block in `whatsapp-processor.ts` now handles **any** free text a linked member sends (`if (trimmed && link)`), not just messages matching `looksLikeQuestion`/`looksLikeAgentAction`. The LLM (with its role-gated tools) decides what to do, so the **English-only regex no longer gates agent-eligibility** (fixes Fable risk #7). The single-shot creator is now reached only when the agent is unavailable (no Gemini key) or media (image/voice/doc) — those still go to the creator until the agent gets multimodal tools. The deterministic report path (role-gated) still runs before the agent as a leaders' fast-path. `looksLikeQuestion`/`looksLikeAgentAction` remain exported/tested but are no longer the routing gate. Cost note (Fable #8): every linked text now spends a Gemini turn — fine at pilot scale. 277 tests pass.

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
