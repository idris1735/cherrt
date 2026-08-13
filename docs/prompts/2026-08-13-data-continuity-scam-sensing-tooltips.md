# DeepSeek Prompt — Data continuity, scam/danger sensing, tooltips, WhatsApp upgrades

> Direction by Claude, from an owner review + my own WhatsApp audit. **Data is the product's memory — capture it, store it, and NEVER ask for the same thing twice.** The assistant must also be sharp: sense scams and danger and refuse/escalate. TDD every service/tool; `tsc`+`build`+full suite green (currently **497**); per-slice commits; update `CHRONICLE.md`. Done inline of this session: consent-first gate on WhatsApp + full NDPA `/privacy` — do NOT redo those; build on them.

## WS1 — Never re-ask for data we already have (HIGH PRIORITY)
Today capture flows/tools ask for fields (name, phone, etc.) even when the person's record already holds them. Fix it so **the assistant knows what it already knows.**
- Add `getKnownProfile(personId): Promise<{ fullName?, phone?, email?, gender?, birthdate?, address?, churches: {id,name,role}[] }>` in `src/lib/services/identity/people.ts` (TDD) — reads `people` + `phone_contacts` + `branch_memberships`.
- **Inject the known profile into `AgentContext`** so every tool + the LLM prompt sees "what we already have about this person." The persona instruction: *never ask for a detail you already hold; confirm it instead ("Still on 0803…?"), and only ask for what's missing.*
- Every capture tool/flow (`register_member`, `register_child`, `capture_first_timer`, `request_pastoral_care`, `submit_pastoral_form`, `join_department`) must **prefill from the known profile and skip fields already stored**, and **write back** anything new so it's never asked again.
- **Acceptance:** register a member twice → the second time it doesn't re-ask name/phone; a field entered once is persisted and reused everywhere. Test the prefill/skip.

## WS2 — Full per-user-type data model + forms audit
Audit every user type and the data each should hold; make the capture (WhatsApp-linked web forms, per the earlier hardening plan) collect the full set and store it on the person. Minimum fields per type:
- **Member:** name, phone, email, gender, DOB, address, marital status, occupation, join date, department(s), emergency contact.
- **Child:** name, DOB, allergies, medical notes, classroom/age-group, guardians + relationships + who-may-collect.
- **First-timer:** name, phone, how they heard, invited-by, address, follow-up status.
- **Leader/volunteer:** role, department, availability/skills.
Each form records consent (Slice C) and writes every field to the person. **Acceptance:** each user type has a form/flow that captures its full field set and stores it; nothing captured is dropped.

## WS3 — Scam & danger sensing (make the AI sharp and safe)
The assistant must detect and refuse/escalate, never comply blindly:
- **Fraud/scam signals:** requests to send money to a *new/unknown* account, anyone asking for an OTP/verification code, impersonation ("I'm Pastor X, send urgently"), phishing links, or pressure/urgency. → Refuse, warn the user it looks like a scam, and **flag to the church's leaders** (`notifyLeaders`). NEVER reveal an OTP or move money to an unverified destination on request.
- **Safeguarding/danger signals:** a child in danger, abuse disclosure, threats, or self-harm. → Respond with care, do NOT counsel, and **immediately route to a human** (pastor/leader) with an urgent flag; surface an emergency-contact/next-step message.
- Implement as (a) a lightweight `assessRisk(text): { kind: "scam"|"safeguarding"|null, reason }` pre-check on inbound, (b) hardened persona guardrails, and (c) a `flagged_messages` table (RLS deny-all) + a panel in `/admin` so the platform team sees flags.
- **Acceptance:** "send ₦200k to 0123… urgently, it's Pastor" → refused + flagged, money not moved; "someone is hurting a child" → care + immediate human escalation, never dismissed. TDD `assessRisk`.

## WS4 — Dashboard tooltips / jargon explanations
On the admin dashboard, hovering (and tapping, on mobile) any jargon shows a plain explanation. Build a small reusable `<InfoTip>` (accessible: `aria-describedby`, keyboard-focusable, `title` fallback) and attach it to: **verification levels** (L0 = unverified, L1 = WhatsApp-verified, L2 = KYC/ID-verified), **KYC result chips** (CAC / trustee match / ID), **KYC statuses**, and any metric label that isn't self-evident. **Acceptance:** hovering "L2" (etc.) explains it; works on touch.

## WS5 — WhatsApp upgrades (my audit findings)
- **Delivery visibility:** the WhatsApp webhook handles inbound `messages` but ignores `statuses` (sent/delivered/read/failed). Handle `statuses` and log failures/undelivered so nobody's message silently vanishes.
- **Tappable follow-ups:** after a guest taps a persona button (member / here-for-my-child), the reply is plain text with "reply X". Where natural, follow with **tappable buttons** for the next step (e.g. a member → Give · Prayer · Join a ministry) — people tap, they don't type.
- Keep the consent-first gate + opt-out suppression intact.

## Order & review
WS1 → WS3 → WS4 → WS5 → WS2 (WS2 is the largest; the others are higher-leverage). Report per WS what you changed and how you tested it. Claude will audit — especially WS1 (does it truly not re-ask?) and WS3 (does it actually refuse the scam and escalate the danger, with tests that prove it).
