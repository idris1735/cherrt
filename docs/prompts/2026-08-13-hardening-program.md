# Hardening Program — WhatsApp-linked web forms, built for real churches

> Direction by Claude. Two owner decisions (2026-08-13): **(1) WhatsApp links out to web forms** for all structured capture; **(2) harden to real, unsupervised church use** — not a demo. This doc defines the quality bar every form must clear, the build sequence, and the first prompt (WS1). DeepSeek implements; Claude reviews. TDD, per-task commits, `tsc`+`build`+full suite green, update `CHRONICLE.md`.

## Architecture: tokenized web forms reached from WhatsApp

The `/onboard/[token]` KYC flow is the template for ALL structured capture. On WhatsApp, an intent that needs real data → Chertt issues a **single-use, expiring token** and sends a link → the user fills a **hardened web form** → submit runs server validation + side effects → the person gets a WhatsApp confirmation. Agent free-chat is reserved for low-stakes capture only (prayer, questions, giving amount).

## THE HARDENING STANDARD (every web form must meet all of this)

**Validation**
- Per-field **client** validation with **inline** errors next to the field (not one line at the bottom).
- **Server re-validates everything** — never trust the client. Reject with field-specific messages.
- Format rules: **NIN/BVN = 11 digits**; **Nigerian phone** = `0XXXXXXXXXX` or `+234XXXXXXXXXX`, normalized to E.164; **email** RFC-ish; **CAC IT/RC** = normalized alphanumeric, length-checked; dates sane.

**Structured data (no cramming)**
- One field per datum. **Split "name & role"** into *full name* (matched to the ID) + *position*. Add a real *phone* field. Collect every column the schema expects (e.g. the **CAC certificate** — currently never asked for).

**File handling**
- Size cap **enforced client AND server** (≤5MB); type allow-list; **client-side image compression**; **preview thumbnail**; graceful "file too large / wrong type" — never a silent failure.

**Error recovery**
- On a failed submit, **preserve everything the user entered, including selected files** (hold files in React state; don't rely on the cleared `<input type=file>`).

**Trust & clarity**
- Sections with headers; helper text on anything a pastor won't know ("the RC/IT number is on your CAC certificate"); a short **trust panel** (why we need NIN + selfie, that it's encrypted, that only the Chertt review team sees it, NDPR); progress affordance for multi-step.

**State & feedback**
- Explicit states: *Sending code… / Uploading & verifying… / Success*. "Send code" → disabled + **60s resend countdown** + "check spam". Disabled submit until valid.

**Security**
- **Rate-limit** the token endpoints (`email-code`, `submit`, and token issuance) per-token and per-IP to prevent Resend/Mono cost abuse. Single-use + expiring tokens (confirm).
- **PII minimization:** store `id_last4` in clear; **do NOT persist the raw NIN/BVN in clear** — redact the number out of the stored Mono `id_result` (keep name/dob/photo), or encrypt it. Document a retention window.

**Design & access**
- Built on the admin design tokens (`globals.css` `:root`) — **not default inputs**. Mobile-first (these are filled on phones), real focus states, labels tied to inputs, keyboard-friendly, light+dark.

## Build sequence

- **WS1 — Harden the onboarding KYC form to the standard** (the exemplar + the front door). *This prompt, below.*
- **WS2 — Correctness/security must-fixes** (parallel, launch-critical, not user-facing):
  - **Referral 24h fix:** `notifyLeaders` uses free-form `sendTextMessage`, which Meta blocks outside the 24-hour window → leaders who haven't messaged today get nothing. Add an **approved template** path for out-of-window leader alerts; log every send outcome.
  - **Rate limiting** + **PII/NIN redaction + retention** (as above, applied server-wide).
  - **KYC failure paths:** a `needs_info` application state + reviewer "request authorization letter / re-submit" + applicant is told *why*.
  - **Delivery visibility:** replace silent `.catch(() => {})` with logged failures the admin can see.
- **WS3 — Per-user-type forms on the pattern** (build child FIRST — safety data must be structured, never chat): **child registration** (guardians, allergies, medical, allowed-pickup), **member**, **first-timer**, **join-department**, **pastoral/life-event forms** (dedication, naming, pre-marital, training). After the 2nd form, **extract a shared web-form framework** (tokenized `form_requests`, `/f/[token]`, shared validation + rendering) — factor from real usage, don't pre-abstract.
- **WS4 — Identity robustness:** duplicate-person detection + merge tooling; better name/phone matching.

---

## WS1 PROMPT — Harden the onboarding KYC form

**Goal:** bring `/onboard/[token]` to the hardening standard above. This is the client's first impression and the legal/trust gate — it must feel like a real product.

**Restructure the fields** (`onboard-form.tsx` + server):
- *Your church:* church legal name (as on CAC) · **CAC IT/RC number** (validated, helper text) · address · denomination (optional) · **church phone** (validated, normalized).
- *You (the applicant):* **full name** (must match your ID — its own field) · **position/role** (select: Senior Pastor / Trustee / Secretary / Other) · ID type (NIN/BVN) · **ID number** (11-digit validated) · email.
- *Verify:* email code (6-digit, appears after send, resend countdown) · **CAC certificate upload** (image/PDF, validated) · **selfie holding your ID** (image, compressed + preview + validated) · consent (proper NDPR copy).
- Update `/api/onboard/submit` to read the new structured fields and **map full name → the trustee-match input** (strengthens the anti-hijack check); persist `cac_cert_path` via the existing storage helper; keep `id_last4`, and **redact the raw NIN from `id_result` before storing**.

**Implement the whole standard**: client+server validation with inline errors; file size/type + compression + preview + graceful errors; state preservation on failed submit; sections + helper text + trust panel; loading/success states + 60s resend; rate-limit `email-code` and `submit`; professional design on the tokens; mobile-first + accessible.

**TDD focus (server is the testable core):** a `validateOnboardSubmission(fields)` pure function (NIN/phone/IT/email/required/file rules) unit-tested with good and bad inputs; the submit route rejects invalid input with field-specific errors (test); NIN redaction verified (test that stored `id_result` has no raw number); rate-limit returns 429 on abuse (test). UI verified via `tsc`+`build`.

**Acceptance:** every field validates client+server with inline errors; CAC cert + structured name/role + phone collected; a 12MB selfie is compressed or cleanly rejected, never silent; a failed submit keeps the user's data + files; endpoints rate-limited; no raw NIN stored in clear; the page looks like something you'd launch. Report back with before/after screenshots or a description of each standard item met, so Claude can review against this list.
