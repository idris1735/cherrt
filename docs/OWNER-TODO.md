# Chertt — Owner TODO (things only you can do)

These are not code. They are credentials, approvals, and decisions the owner must complete before/around go-live. Code status: complete and tested (see CHRONICLE.md, HANDOFF.md).

## Go-live blockers
- [ ] **Email working in prod** (SMTP or Resend vars in Vercel). HARD BLOCK — the onboarding form needs an email OTP to submit. If email is down, no church can finish signup.
- [ ] **Mono LIVE key** (`MONO_SECRET_KEY`) in Vercel — real BVN/NIN/CAC verification. Without it, KYC can't actually verify identity.
- [ ] **Supabase storage bucket** for KYC uploads (selfie, CAC) exists and is writable.
- [ ] **Platform admin access** — `PLATFORM_ADMIN_EMAILS` set; someone can log into `/admin` to approve churches.
- [ ] **WhatsApp connected** — number live, webhook verified.

## WhatsApp message templates (Meta approval)
- [ ] Approve the 3 templates in Meta and set `WHATSAPP_TEMPLATE_NEW_SIGNUP`, `WHATSAPP_TEMPLATE_ORG_APPROVED`, `WHATSAPP_TEMPLATE_ORG_REJECTED` (bodies in `docs/kyc-whatsapp-templates.md`).
- [ ] **Out-of-window notifications** (flagged 2026-09-22): approval buttons and decision notices sent to a leader/applicant who is NOT in an active 24h WhatsApp chat require an approved template. Until then, those notifications only land inside an active conversation. This unblocks reliable approvals AND all reminders/broadcasts.

## Payments
- [ ] **Paystack keys** (`PAYSTACK_SECRET_KEY`) — until set, giving returns a demo link and does not charge.

## Decisions
- [ ] Currency — Naira-only today. Confirm or expand.
- [ ] Data ownership policy.
- [ ] Church-facing web dashboard — yes/no (currently WhatsApp-only; a login for finance/leadership would be a new build).

## Ops hygiene
- [ ] **Move the repo off the OneDrive-synced Desktop** — it has zeroed files before.
