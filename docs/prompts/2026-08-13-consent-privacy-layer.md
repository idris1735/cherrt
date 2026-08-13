# DeepSeek Prompt — Consent & Privacy Layer (NDPR-grade, cross-cutting)

> Direction by Claude. **Principle: no person's data is captured or stored without a recorded lawful basis** — consent (or notice + legitimate interest), and **children ALWAYS via a guardian's consent.** This is a compliance layer that threads through first-contact and every capture/form. Nigeria's NDPR/NDPA 2023: lawful basis, clear notice, consent, and data-subject rights (access, deletion, objection), with heightened care for minors. TDD, per-task commits, `tsc`+`build`+suite green, update `CHRONICLE.md`.

## Current state (audited 2026-08-13)
- ✅ Owner KYC form has real consent (`consent` required, `consent_at` stored).
- ✅ First-contact **notice** shipped (guest welcome states data use; `privacy` + `stop` replies exist).
- ❌ **No consent on any chat capture** (`register_member`, `register_child`, `capture_first_timer`, `capture_prayer_request`, `join_department`).
- ❌ `ensureVerifiedPerson` stores a person on first inbound with **no recorded consent**.
- ❌ `STOP` only acknowledges — **no real opt-out/suppression**.
- ❌ No privacy-policy page, no data-subject request (access/deletion) flow, no versioned consent record.

## Build slices

### Slice A — Consent data model
- **Migration:** add to `people`: `consent_at timestamptz`, `consent_version text`, `consent_source text` (e.g. `whatsapp_first_contact` / `onboarding_form` / `member_form`). New table **`data_requests`** (`person_id`, `workspace_id?`, `kind('access'|'deletion'|'objection')`, `status('open'|'done')`, `note`, `created_at`). Add `opted_out boolean default false` + `opted_out_at` to `phone_contacts` (opt-out is per number). All RLS deny-all.
- **Service:** `src/lib/services/privacy/consent.ts` → `recordConsent({ personId, version, source })`, `isOptedOut(phone)`, `setOptedOut(phone)`, `logDataRequest({...})`. `CONSENT_VERSION` constant.
- **Acceptance:** consent + opt-out + data requests are storable and queryable; TDD each.

### Slice B — First-contact consent + real opt-out enforcement
- Upgrade the guest welcome notice to **recorded consent**: the first substantive action (tapping a who-are-you button, sending a code, or replying AGREE) calls `recordConsent(source:'whatsapp_first_contact')` on the person. Keep it light — one clear notice, consent by continuing, no nagging.
- **Enforce STOP:** `setOptedOut(phone)` on `stop`; and **suppress all outbound sends to opted-out numbers** — add an `isOptedOut` guard in `sendTextMessage`/`sendTemplateMessage` (skip + log). `start`/`hi` clears the opt-out with a fresh consent notice.
- **Acceptance:** after STOP, the number receives nothing until it re-engages; consent is recorded on first contact. Test the suppression guard.

### Slice C — Consent on every registration/form (self-consent)
- Every capture flow and every web form (member, first-timer, join-department, pastoral forms, and the onboarding form) records the subject's consent (`recordConsent`) at submit, and shows a short consent line. For **self-service chat captures**, the person consenting is the sender (they already saw first-contact consent — record the specific-purpose consent too).
- **Acceptance:** no registration writes a person/record without a consent row; TDD the write path.

### Slice D — Guardian consent for children (non-negotiable)
- `register_child` and the child web form must capture **explicit guardian consent** ("I am this child's parent/guardian and consent to storing their details"), recorded on the child `person` as guardian-given (store `consent_source:'guardian'` + the guardian's `person_id`). Never store a child without it.
- **Acceptance:** a child cannot be created without a recorded guardian consent; test the refusal.

### Slice E — Notice to third-party-registered people + privacy page + data rights
- When a **leader** registers someone else (a member/first-timer with a phone), send that person a WhatsApp notice: "Your church added you to Chertt. Reply *privacy* to learn more, or *stop* to opt out / be removed." (Respects the opt-out guard.)
- **Privacy policy page:** a real `/privacy` web page (on the design kit) explaining what's collected, why, retention, and rights. Link it from the onboarding form + the `privacy` reply.
- **Data-subject requests:** `privacy` / `delete my data` → `logDataRequest`; surface open requests in `/admin` for the platform team to action. (Actual deletion can be manual for now, but the request must be captured, not dropped.)
- **Acceptance:** a third-party-registered person is notified and can opt out; `/privacy` exists; deletion/access requests are recorded and visible to admins.

## Cross-cutting rule (enforce in review)
Every path that creates or enriches a `person` or a personal record must have a recorded lawful basis before/at write time. Children: guardian consent, always. Opted-out numbers: never messaged. Consent is versioned so a policy change is auditable.
