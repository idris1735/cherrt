# Secure Church Onboarding (KYC) — Design Spec

**Date:** 2026-08-09
**Phase:** 1, Slice 2 (whole of it — intake + verification + review + approval)
**Status:** Approved (brainstorming) → implementation plan next.

## Goal

Make owning a church production-grade and Nigerian-real: nobody sets up a church without KYC. A creator does a proper KYC on a secure web page; the Chertt platform team reviews **every** application on a dashboard; on approval the church goes live, the applicant is seated as **creator**, and Chertt messages them on WhatsApp. Unverified churches can do nothing sensitive.

## Non-goals (later)

- Automated liveness / face-match (Smile ID / Dojah). Replaced here by **manual photo comparison** (selfie vs the ID photo Mono returns) in the review dashboard, plus a "selfie holding your ID" requirement. Automated liveness is a future upgrade.
- Member-facing changes (members stay on WhatsApp, untouched).
- Auto-approve-on-pass (we chose manual review of every church for now).

## Decisions locked (brainstorming)

- **Collection surface:** a secure **web KYC form** (WhatsApp kicks it off + notifies). On-brand: web = admin-only.
- **Approval:** **manual review of every church** by the Chertt platform team.
- **Liveness:** skipped as a paid vendor; **manual side-by-side** photo compare + "selfie holding ID."
- **Provider:** **Mono** for CAC/IT + NIN/BVN lookups (keys provided; use a **sandbox** key for dev — live lookups cost ₦).
- **Dashboard auth:** reuse the app's Supabase auth, gated to a **`PLATFORM_ADMIN_EMAILS`** allowlist.

## The Nigerian reality baked in

Churches register with **CAC as Incorporated Trustees** (CAMA Part F). The number is an **IT number**; the people on record are **trustees**. The applicant must be tied to the church: their **NIN/BVN name is matched to a named trustee** from the CAC record (or the reviewer requires an authorization letter). This is the anti-hijack control.

## Architecture / flow

1. WhatsApp: *"set up my church"* → Chertt creates a pending application + sends a **tokenized web link** (`/onboard/<token>`, token tied to their phone, single-use, expiring). Replaces today's 5-question chat flow.
2. **Web KYC form** (`/onboard/[token]`, mobile-first): church legal name, **IT/RC number**, address, denomination, size, applicant's **role/title**, **NIN or BVN**, **email**, **live selfie ("hold your ID")**, optional **CAC certificate** upload, and explicit **NDPR consent** checkbox.
3. **Submit** (`POST /api/onboard/submit`): runs checks server-side —
   - **CAC/IT lookup** (Mono) → church real? returns registered name + trustees.
   - **NIN or BVN lookup** (Mono) → person real? returns name, DOB, and **photo**.
   - **Trustee match**: applicant's verified name vs a trustee name (fuzzy) → flag if no match.
   - **Email** verify (6-digit code to the email).
   - **Phone OTP** (already built) — the WhatsApp number.
   - Selfie + CAC cert stored in a **private** Supabase Storage bucket.
   Each check writes a result/score to the application.
4. Status → **`pending`**; it appears in the **platform review dashboard** (`/admin/kyc`).
5. **Reviewer** sees all data + check results + **selfie beside the Mono ID photo**, and **approves or rejects** (with a reason).
6. On **approve**: create the org/workspace, seat the applicant as **creator**, send the **WhatsApp approval** (existing `sendOrgApprovedTemplate`), start post-approval setup. On **reject**: WhatsApp rejection with reason (existing `sendOrgRejectedTemplate`).
7. **Tiered access:** a church that isn't `approved` can't collect money, invite members, or broadcast — enforced at those entry points.

## Data model

**`kyc_applications`** (new): `id`, `token` (unique, single-use), `token_expires_at`, `applicant_phone`, `church_legal_name`, `it_number`, `address`, `denomination`, `size`, `applicant_role`, `id_type` (`nin`|`bvn`), `id_number` (stored encrypted / last-4 in clear), `email`, `email_verified_at`, `selfie_path`, `cac_cert_path`, `consent_at`, `cac_result` (jsonb), `id_result` (jsonb: name, dob, photo_url), `trustee_match` (`match`|`no_match`|`unknown`), `status` (`draft`|`pending`|`approved`|`rejected`), `reject_reason`, `reviewed_by`, `reviewed_at`, `workspace_id` (set on approve), `created_at`.

Private Storage bucket **`kyc`** for `selfie_path` / `cac_cert_path` — served to reviewers via short-lived **signed URLs**, never public.

## Components (files)

- **`src/lib/services/kyc/mono.ts`** — Mono client: `monoCacLookup(itNumber)`, `monoIdLookup(type, number)`. Base URL + `mono-sec-key` header from env; sandbox vs live by key. (Exact endpoints verified against Mono docs during the plan.)
- **`src/lib/services/kyc/applications.ts`** — create/fetch/update `kyc_applications`; token issue/validate; the check-orchestration (`runKycChecks`).
- **`src/lib/services/kyc/storage.ts`** — private upload + signed-URL read for the `kyc` bucket.
- **`src/lib/services/kyc/email-otp.ts`** — email code send/verify (reuse the OTP table with `purpose='email'`, delivered by an email provider — see open item).
- **`src/app/onboard/[token]/page.tsx`** + a client form component — the KYC form.
- **`src/app/api/onboard/submit/route.ts`** — validate token, store uploads, run checks, set `pending`.
- **`src/app/admin/kyc/page.tsx`** (list) + **`/admin/kyc/[id]/page.tsx`** (review, side-by-side photos) — gated to `PLATFORM_ADMIN_EMAILS`.
- **`src/app/api/admin/kyc/[id]/route.ts`** — approve/reject (creates workspace + seats creator + WhatsApp notify on approve).
- **Modify** `onboarding-flow.ts` / `whatsapp-processor.ts` — *"set up my church"* now issues a token + sends the link (retire the 5-question chat flow).
- **Modify** the money/invite/broadcast entry points — block for non-approved churches (tiered access).
- **Migrations**: `kyc_applications` (+ RLS deny-all), the `kyc` storage bucket, `otp_challenges.purpose` add `'email'`.

## Verification checks — pass criteria

- **CAC/IT**: Mono returns an active registration whose name reasonably matches the entered legal name.
- **ID (NIN/BVN)**: Mono returns a valid record; name matches the applicant; photo returned for manual compare.
- **Trustee match**: applicant name appears among trustees (fuzzy) — else flagged for the reviewer, not auto-failed.
- **Email/phone**: both verified before submission completes.
- Nothing auto-approves — the reviewer decides with all of the above visible.

## Error handling

- Invalid/expired/used token → friendly "ask Chertt for a fresh link."
- Mono check failure/timeout → mark that check `errored`, still queue for manual review (reviewer can re-run).
- Upload too large / wrong type → rejected client + server side.
- Duplicate application (same phone/IT number pending) → resume the existing one, don't fork.
- Approve/reject is idempotent; WhatsApp notify failure never blocks the state change.

## Compliance (NDPR)

Explicit consent captured (`consent_at`) before any lookup; ID numbers stored encrypted (or only last-4 in clear); selfies/docs in a private bucket with signed-URL access; `kyc_applications` RLS deny-all (service-role only); a documented retention window; data minimization (store only what a reviewer needs).

## Testing

- `mono.ts`: request shape (headers, body), success/error parsing — mocked `fetch`.
- `applications.ts`: token issue/validate (single-use, expiry); `runKycChecks` aggregates results + sets status; trustee fuzzy-match.
- `storage.ts`: private upload + signed-URL read (mocked).
- submit route: token-gated; missing consent rejected; runs checks; sets `pending`.
- admin route: non-allowlisted user denied; approve creates workspace + seats **creator** + notifies; reject records reason + notifies.
- tiered access: a non-approved workspace is refused money/invite/broadcast.

## Open items to resolve during the plan

- **Email delivery provider** (for the email OTP) — Resend/SES/etc. (small; pick during plan; per the marketplace guidance, prefer a real provider).
- **Exact Mono endpoints** for CAC + NIN/BVN — verify against Mono docs (WebFetch) in the plan before coding.
- **ID-number encryption** approach (app-level encrypt vs store last-4 + hash).

## Scope note

This is a large slice (web forms + file upload + a live external integration + a review dashboard + auth + tiered access). The implementation plan will decompose it into many small TDD tasks, and it is realistically a multi-day build — not a single sitting.
