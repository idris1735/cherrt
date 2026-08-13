# DEMO-DAY WAR PLAN — DeepSeek execution (serious client demo, TODAY)

> Direction by Claude. A serious client demo is TODAY. The WhatsApp ↔ web ↔ admin loop must run **end-to-end and look like a launch**. Execute **STRICTLY in priority order** — P0 first (demo *breaks* without these), then P1 (demo looks *amateur* without these), then P2 (stretch). Each task: fast but **tested** (`tsc` + `build` + suite green), **one commit**, push to `main` (auto-deploys). If a task is blocked, skip to the next and flag it — never stall.

## The strategic insight
The single biggest demo risk is **external services DeepSeek can't configure** — the WhatsApp number, Mono keys, Resend, approved templates. So **P0 is about resilience**: make every external dependency **degrade gracefully** so a missing key never crashes the demo. Do P0 in full before anything else.

## What DeepSeek CANNOT do — the owner must (flag immediately if unset)
Vercel env: `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` (number live + reachable) · `MONO_SECRET_KEY` (live for a real church, or sandbox + a known test IT/NIN) · `RESEND_API_KEY` · `PLATFORM_ADMIN_EMAILS` + a Supabase login for the reviewer · `NEXT_PUBLIC_APP_URL` (real domain). P0 below makes the demo survive if some of these are missing, but the WhatsApp number itself must be live.

---

# P0 — Make the loop UNBREAKABLE (do all of these first)

### P0-1 · OTP over WhatsApp — kill the Resend single-point-of-failure
The onboarding email code is the most likely place to hard-block (no Resend key = no code = dead demo). Since the application already stores `applicant_phone`, **also deliver the code over WhatsApp.**
- Add `sendOnboardingOtp(email, phone)` (or extend `sendEmailOtp`) that stores the code, tries Resend email, **and always `sendTextMessage`s the same code to `phone`.**
- `src/app/api/onboard/email-code/route.ts`: resolve the token → `applicant_phone`, call the new function so the code goes to both. Update the form copy to "We sent a 6-digit code to your email **and your WhatsApp**."
- **Acceptance:** with `RESEND_API_KEY` unset, an applicant still receives a code (on WhatsApp) and completes onboarding. Test: the send path calls `sendTextMessage` with the applicant's phone + a 6-digit code.

### P0-2 · Template fallback for every business-initiated message
Approved WhatsApp templates may not exist yet. Wrap the template sends so they **fall back to plain `sendTextMessage`** on failure (in a live demo the recipient is inside the 24-hour window, so plain text delivers).
- `whatsapp-templates.ts`: `sendOrgApprovedTemplate` / `sendOrgRejectedTemplate` → `try template … catch → sendTextMessage(to, "<same message in plain text>")`.
- `referral.ts` `notifyLeaders` already uses plain text — add a logged outcome per send.
- **Acceptance:** approving a church delivers an "approved 🎉" WhatsApp message to the applicant with **no approved template configured.** Test the fallback branch.

### P0-3 · Submit + KYC checks can NEVER hard-fail
Mono can be down, rate-limited, or sandbox. The applicant must always reach `pending`.
- `src/app/api/onboard/submit/route.ts`: wrap the `runKycChecks` call and the whole side-effect block so **any** thrown error still sets the application to `pending`, stores whatever it has, logs the error, and returns `{ ok: true }`. Never 500 on a real submission.
- Confirm `runKycChecks` (`applications.ts`) already catches Mono errors and records `cac_result`/`id_result` as errored — harden if not.
- **Acceptance:** submit with Mono unreachable → the application still appears in `/admin/kyc` as `pending` with an "auto-checks incomplete — verify manually" note.

### P0-4 · Review dashboard renders ANY data shape — zero crashes
`/admin/kyc/[id]` must survive null/sandbox/errored Mono data and missing photos.
- Guard every field. Add clear status chips: **CAC** (found / not found / errored), **Trustee** (match / no-match / unknown), **ID** (verified / errored). Render the **CAC certificate** (now uploaded) beside the selfie and NIN photo. Handle "no image" gracefully.
- **Acceptance:** the reviewer always sees a complete, non-crashing review screen and can Approve/Reject for any application.

### P0-5 · Fresh-guest first contact — verified + warm
- Confirm: a brand-new number → greeting + 3 buttons (*Set up my church · I have a code · What can you do?*) → tapping **Set up my church** → the onboarding link. Improve the copy to be warm + professional; make the link message unmistakable ("Tap to verify your church securely 🔒 <link>").
- **Acceptance:** a never-seen number gets an excellent first message, working buttons, and a clear link.

### P0-6 · One-command demo reset (repeatable rehearsals)
- `scripts/reset-demo.mjs`: Node + `SUPABASE_SERVICE_ROLE_KEY` (load `.env.local`), delete all rows from every public data table (multi-pass to satisfy FKs), empty the `kyc` storage bucket, leave schema intact. Wire `npm run reset-demo`.
- **Acceptance:** `npm run reset-demo` → clean slate in seconds; safe to run between rehearsals.

---

# P1 — Make it look like a LAUNCH (client is watching)

### P1-7 · `/admin/kyc` review screen — make it sharp
Design-kit polish; selfie vs NIN photo **side-by-side with click-to-zoom**; CAC-certificate viewer; result cards (CAC / trustee / ID); prominent Approve (green) / Reject (with reason) with a confirm. This is the exact screen the client watches you approve on — it must look like a bank's back-office.

### P1-8 · WhatsApp copy pass — everything the client READS
Rewrite for warmth, professionalism, concision, Nigerian-church tone, tasteful emoji, zero dev-speak: greeting · main menu · help · onboarding-link message · approval/rejection messages · post-approval setup prompts (giving categories → ministries → branches) · referral confirmations · prayer/pastoral replies · tiered-access refusals · convert/first-timer/child/member confirmations. Keep every message short and human.

### P1-9 · Admin console — consistency, empty & loading states
Overview / churches / people / KYC: skeleton loaders, friendly empty states ("No churches yet — approve one and it appears here"), consistent spacing/typography, tabular numerals, fully responsive. Nothing should look half-built.

### P1-10 · Onboarding form — final touches
Live phone formatting as they type; NIN digit grouping; autofocus the first field; disable Submit until valid with a hint on what's missing; a slim top progress indicator (**Church → You → Verify**); tighter mobile spacing. Builds on the hardened form already shipped.

### P1-11 · Sign-in / admin entry — visual polish
Clean branded sign-in card; smooth redirect to `/admin`; warm error copy; loading state on submit.

---

# P2 — STRETCH (only if P0+P1 are done; in this order)

### P2-12 · Child registration as a web form (the safety-critical "form for another user type")
WhatsApp "register my child" → issue a token → link to a hardened `/f/child/[token]` (or `/onboard-child/[token]`) web form: child full name, DOB, **allergies**, medical notes, classroom/age-group, guardian relationship, **allowed-to-pick-up**. Submit → child `people` row (`is_minor`) + `child_profiles` + `guardianship`. Same hardening standard as onboarding (validation, files, trust). Demonstrates the "WhatsApp-linked web forms for every user type" vision live.

### P2-13 · Member registration web form (same tokenized pattern).

### P2-14 · Seeded happy-path safety net
`scripts/seed-demo.mjs` (separate from reset): stage ONE approved church + a couple of members/children/first-timers/milestones, so if live capture stumbles mid-demo the console still tells the story. Never auto-run; owner triggers it.

### P2-15 · Failed-send visibility
Log every WhatsApp/Resend send outcome; surface failures where the admin can see them, so nothing fails silently during the demo.

---

## Rules for today
- **Order is law:** finish P0 entirely before P1, P1 before P2. A demo that survives beats a half-finished flourish.
- Every task: tested, one commit, pushed. Move fast; if blocked >15 min, skip + flag.
- After each priority tier, post a one-line status so Claude can spot-review the critical paths (especially P0-1, P0-2, P0-3 — the resilience layer).
- **Do not fake acceptance.** If something isn't done, say so — a known gap we can narrate around beats a surprise crash in front of the client.
