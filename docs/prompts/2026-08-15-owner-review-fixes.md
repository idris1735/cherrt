# DeepSeek Prompt — Owner-review fixes (Pastor Kolawole + Isaiah, 2026-08-15)

> Direction by Claude, from the Phase 1&2 review. **P0 bugs were promised for the next morning — do those FIRST.** TDD the P0s (especially P0-1); per-slice commits; `tsc`+`build`+full suite green; update `CHRONICLE.md`.

## Locked decisions (context — resolves earlier open questions)
- **One shared Chertt WhatsApp number** for all churches; segmentation happens by identity in the backend (Meta doesn't give per-church numbers). This is settled — do NOT build per-church numbers.
- **KYC:** a **church (business) entity keeps human-in-the-loop review** (churches are few; a human check is fine). An **individual user's** verification (NIN) is automatic. Tiered access stays: a church gets limited "semi-active" use after the automated checks pass, full use after human approval.
- Church **setup** is captured on the **web form** (avoids WhatsApp rate-limit/cost on a heavy flow); normal user + child registration stays in chat.

---

## P0 — Bugs (promised for tomorrow morning)

### P0-1 — Join-by-code doesn't link a *welcomed* guest  ← the critical one, seen live
**Root cause** (`whatsapp-processor.ts` ~line 1080): the bare-code match is gated on `!session.welcomed`:
```js
trimmed.match(/^join[\s-]?([a-z0-9]{8})$/i)
  ?? (!session.welcomed && /^[a-z0-9]{8}$/i.test(trimmed) ? [trimmed, trimmed] : null)
```
So a guest who taps **"Send my code"** and sends a bare code like `DAYSTAR3` while `welcomed===true` is **not recognized** — it falls through to the guest AI, which chit-chats *"thanks for the code"* and **never provisions a membership**. Then "what's my church?" fails because no link exists. (The `findWorkspaceByJoinCode` lookup itself is fine — the seed's `DAYSTAR3` resolves; it's the *match* that never fires.)
**Fix:** add a session flag `awaitingJoinCode`, set `true` when the guest is prompted for a code (the `guest_code` button **and** the `guest_member` "send your church code" reply). While it's set, accept a bare 8-char code as a join **regardless of `welcomed`**, then clear the flag. Keep the `JOIN <code>` prefix path unchanged. **TDD:** a welcomed guest, prompted for a code, sends bare `DAYSTAR3` → gets linked to Daystar.

### P0-2 — Confirm the church before connecting
When a code resolves, don't link silently. First reply with the church's **name + city + phone** and ask *"Is this your church? Reply YES to connect."* Only on YES → `provisionPersonMembership`. (Kola: "confirm this is the church you're trying to connect to.")

### P0-3 — Repeat visitor stays connected, greeted per-church
A returning linked member must be greeted with **their church's name** ("Welcome back to *Daystar* 🙏") and never re-asked for a code. Verify the link persists across messages and single-church members skip straight to their church context.

### P0-4 — `/admin` church rows not clickable
The churches list (and the pending-KYC list) rows don't navigate on click. Make each row link to its detail/review page.

### P0-5 — A `reset` command for role-testing
Add a WhatsApp `reset` command that clears **the sender's own** session + link, so the owner can re-test as a fresh user / different role without touching code. (Only ever resets the sender's own conversation — safe.)

---

## P1 — Form & product changes (this week)

### P1-1 — The church phone IS the church's WhatsApp number — label it so
This field is the church's **official WhatsApp line** — the church identifier, where the verification code is sent, and where members will message the church. Label it clearly (e.g. *"Church WhatsApp number — the line your members will message"*), send the MFA code to **that** number, and flag (yellow, don't block) if it differs from the applicant's own number.

### P1-2 — Structured location + phone defaulting
Replace the free-text address with **country + city + street**. Choosing **Nigeria** defaults the phone to **+234** and validates the format; constrain it so a foreign number or "11111111" can't pass. (Kola: "14 Salawa St" tells us nothing; Google Maps optional.)

### P1-3 — Data minimization — collect only what Mono needs
Trim the KYC form to **exactly** what Mono's verification requires (CAC = the RC number only). **If Mono's CAC lookup doesn't need the certificate document, drop the cert upload** — the law makes us responsible for data we hold, so hold only what's needed. Confirm against Mono's required fields before removing.

### P1-4 — Onboarding link as a tappable CTA button
Send the `/onboard` link as a WhatsApp **URL button** (tappable, hides the raw URL) rather than a bare link in the text body.

---

## P2 — Later (noted, not now)
- Real-time **"CAC verified ✓"** badge as the RC number is typed.
- **Username** church identifier alongside the code (WhatsApp is moving to usernames — easier to remember); each church keeps its code too, like old vs new bank account numbers.
- Website field, captured over time in the toolkit.

## Phase 3 (next Saturday) — heads-up, not this prompt
Sunday & Giving: attendance, department reports, volunteer-captured data, approvals, heavy reporting — **and real giving** (paying on the platform, not just the report of giving).
