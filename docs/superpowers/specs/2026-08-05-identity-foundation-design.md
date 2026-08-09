# Identity Foundation — Design Spec

**Date:** 2026-08-05
**Phase:** 1 (Foundation), Slice 1 of 4
**Status:** Approved (brainstorming) → writing implementation plan next.

## Goal

Establish the real identity foundation: who a user is, how they get in (guest, member, or creator), number-verification, secure number migration, and the role model — **replacing demo mode entirely**. This is production onboarding; no demo, no mocks.

## Non-goals (explicitly deferred to later slices)

- **Church KYC** (CAC + NIN via Mono) and L2 identity verification — Slice 2 (needs Mono keys).
- **Admin dashboard** — Slice 3.
- **Own-number-per-church routing** — Slice 4; keep the current `activeWorkspaceId` model.
- **Payments** — Phase 3.

## What already exists (build on it, don't rebuild)

The person-centric spine is in place:
- `people` (the human), `phone_contacts` (a number tied to a person; `status` active/retired; `verified_at`), `branch_memberships` (person↔workspace, `role`, `status` active/left).
- `resolveIdentityByPhone`, `provisionPersonMembership`, `migratePersonPhone`.
- `foundingAdminRole("church")` currently returns `senior_pastor` — the thing we change.

## Design

### 1. Roles (`identity/role-catalog.ts`)
- **Add `creator`** — the account owner who signs the church up. Rank 6 (top authority, same tier as owner/senior_pastor). Full admin: can set up the church and assign roles. **It is NOT a church ministry title** — ministry titles (senior_pastor, pastor, …) are assigned later, to real people.
- **Add `it_technical`** — can configure/fix the church's setup (settings, modules) but **cannot read church data** (giving, member PII, prayer, pastoral). Rank 2 (clears config), plus an explicit **data-read denial** enforced on sensitive tools.
- **Change `foundingAdminRole("church")` → `"creator"`** (was `senior_pastor`). This is the dealbreaker fix.
- Everywhere the code treats senior_pastor/owner/admin as "top authority" for approvals/admin (`whatsapp-workspace.ts:751`, `:858`), **include `creator`** so the founder keeps admin/approver power.

### 2. Membership statuses (`branch_memberships.status`)
Add **`guest`** to the allowed set (`active` | `left` | `guest`):
- **guest** — connected to a church (has interacted) but not a full member. May do low-risk member self-service scoped to that church (prayer, first-timer, giving).
- **active** — a full member. **left** — former.
- Guest → member is a status change (by a leader, or on formal registration in Phase 2).

### 3. Verification levels (`identity/verification.ts`, new)
Derived, not a stored enum:
- **L0** — unknown.
- **L1 — number-verified**: the person has an active `phone_contact` with `verified_at` set. **Set automatically on first inbound message** (the inbound WhatsApp message *is* proof of number control). Helper: `verificationLevel(personId) → 0 | 1 | 2`.
- **L2 — identity-verified**: Mono NIN — Slice 2. Hook only here.

Gating in this slice: L1 is required for member self-service (give / register). The `creator` is L1 now; L2/KYC will gate a church "going live" in Slice 2.

### 4. OTP — step-up + migration (`identity/otp.ts` + `otp_challenges` table, new)
`otp_challenges`: `id`, `phone_number`, `purpose` (`migrate` | `step_up`), `code_hash`, `expires_at` (10 min), `attempts` (max 3), `consumed_at`, `created_at`.
- `sendOtp(phone, purpose)` — generate a 6-digit code, store `sha256(code + PEPPER)`, send the code over WhatsApp (`sendTextMessage`). One active challenge per (phone, purpose); re-send replaces it.
- `verifyOtp(phone, purpose, code)` — check hash, expiry, attempts; increment attempts on miss; mark `consumed_at` on success. Returns `{ ok }` or a reason (`expired` | `wrong` | `too_many` | `none`).
- **Used in this slice for self-serve migration.** Step-up call sites (money-out, child pickup, role changes) are wired in their own phases; the helper is ready.

### 5. Onboarding rewrite — remove demo, real first contact
**Remove the entire demo surface:**
- Delete `services/demo/demo-mode.ts`, `services/demo/provision-demo.ts` (+ their tests, `whatsapp-session-demo.test.ts`).
- In `whatsapp-processor.ts`: remove `handleDemoOnboarding`, `sendDemoTour`, `DEMO_ROLES`, `sendRoleMenu`, `handleRoleSwitch`, the `demo_menu`/`role:` button and text handling, the `isDemo` branches in `sendMainMenu`, and the `demoRole` argument threaded through `agentCtx`. `sendMainMenu` keeps its rows minus "Try another role".
- In `whatsapp-session.ts`: remove `isDemo`, `demoRole`, and the `demo-onboarding` variant of the `onboarding` union; drop `demo_role`/`is_demo` from the DB mapping (leave the columns — harmless).

**New first-contact behavior:**
- On **any inbound**, resolve-or-create a **Person + active `phone_contact`** for the sender and set `verified_at` if unset — so every number is a known, L1 user (answers "what does the platform register as a user"). This happens even before they belong to a church.
- An **unlinked** sender falls to the existing **guest path** (`runGuestAgent`) — church-focused: reply *"set up my church"* or send your church's code. (This is the pre-demo behavior.)
- **"Set up my church"** → existing signup flow → `approveOrganization` seats the founder as **`creator`** (never senior_pastor).
- **Join by code/QR** → membership as a **member**.

### 6. Number migration — harden (`agent/migration-tools.ts`)
Self-serve path from the **new** number:
1. Sender says they changed numbers → capture their **old** number.
2. `sendOtp(oldPhone, "migrate")` (delivered to the old number if they still hold it).
3. They enter the code → `verifyOtp` → `migratePersonPhone(personId, newPhone)`.
4. If they no longer hold the old number (can't get the code) → fall back to the **existing admin-approval** migration flow.
Guard (existing): refuse if the new number is already active for another person.

## Data flow (per inbound message)
`wa_id` → resolve/create Person + verified contact (L1) → resolve church context (`activeWorkspaceId` default) → membership+role, or **guest** → route to handler.

## Error handling
- OTP: expired / wrong / too-many-attempts → specific messages; sends are rate-limited (one active per phone+purpose).
- Migration: new number already active elsewhere → refuse with a clear message.
- Church creation failure → graceful "try again", no partial identity.
- `it_technical` attempting a data-read tool → denied with "your role can configure but not view church data."

## Testing (behavior is real; only outbound WhatsApp is stubbed in tests)
- **role-catalog**: `creator` rank 6; `foundingAdminRole("church") === "creator"`; `canAssignRole` for creator; `it_technical` clears config but is denied on sensitive-data tools.
- **membership**: `guest` status accepted; guest resolves to guest handling.
- **identity**: inbound creates Person + `verified_at` (L1 auto); `verificationLevel` returns 1 for a verified contact, 0 otherwise.
- **otp**: `sendOtp` stores a hashed code with expiry; `verifyOtp` → ok / expired / wrong / too_many; single-use (`consumed_at`).
- **migration**: OTP path calls `migratePersonPhone`; fallback to admin when OTP can't be completed.
- **onboarding**: founder becomes `creator` — assert it is **never** `senior_pastor`.
- **demo removal**: unlinked sender hits the guest path; no `demo_*`/`role:` triggers remain; existing processor/session tests updated.

## Files
**New:** `identity/otp.ts`, `identity/verification.ts`, `supabase/migrations/<date>_guest_status.sql`, `supabase/migrations/<date>_otp_challenges.sql`.
**Modified:** `identity/role-catalog.ts`, `whatsapp-workspace.ts` (founding role + approver/admin queries include `creator`), `whatsapp-processor.ts` (demo removal, guest onboarding, inbound person-upsert, OTP migration), `whatsapp-session.ts` (drop demo fields/variant), `agent/migration-tools.ts` (self-serve OTP migration), `identity/access.ts` or the tool guard for `it_technical` data denial.
**Deleted:** `services/demo/demo-mode.ts`, `services/demo/provision-demo.ts`, and their tests + `whatsapp-session-demo.test.ts`.

## Open decisions carried forward (do NOT block this slice)
- Own-number-per-church vs shared number (Slice 4).
- Data ownership: system-of-record vs integrate.
- WhatsApp billing/templates (gates proactive messaging, Phase 4).
