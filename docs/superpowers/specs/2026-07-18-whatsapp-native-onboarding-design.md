# WhatsApp-Native Onboarding — Design

**Date:** 2026-07-18
**Status:** Approved, implementation starting
**Supersedes:** the assumption in the earlier UI brief (`2026-07-16` conversation) that role
assignment, consent capture, and admin setup need a web screen. They don't — corrected here.

## The core principle

Design as if the web app doesn't exist. Only fall back to a non-WhatsApp surface where there's a
real, defensible reason WhatsApp text genuinely can't do the job — not because a screen would be
easier to imagine. Web stays as a bonus surface (reports, richer views) for surfaces that already
work conversationally; it is never a dependency for onboarding, roles, or consent.

The one deliberate exception: the children's check-in scanner. A camera-driven PWA used only by
ushers during live Sunday check-in. This is a UX/reliability argument (a line of parents needs an
instant pass/fail, not "send a photo, wait for a reply"), not a claim that WhatsApp is technically
incapable. It's a bounded tool for one fast interaction — it doesn't touch identity, onboarding,
roles, or admin setup, so it doesn't erode the principle elsewhere.

Paystack's own hosted checkout/onboarding pages are a similar non-exception: they're a third-party
web surface Chertt links out to, not a Chertt-owned web app. Sending a link and reading back a
webhook confirmation doesn't violate "no Chertt web app."

## Tenant hierarchy

```
Chertt WhatsApp number (one, shared)
  → organizations (new table) — the church, top-level, what gets approved
      → workspaces (existing table + new organization_id FK) — branches
          → members, giving, service reports, roles — all branch-scoped
```

A single-location church is just one workspace under one organization — not a special case, the
same shape as a multi-branch church with one branch. Operational data (giving, attendance, service
reports, staff roles) is always scoped to a workspace/branch, because that's where it actually
happens. A senior pastor / organization admin gets read access across every workspace under their
organization for roll-up queries ("how did we do across all branches this month").

## New church signup — WhatsApp-only, human-approved

**Decision, made explicitly by the client:** new organization creation is human-approved, not
self-serve. This matches the existing sales-led reality (per-church pricing conversations already
happen manually) and avoids anyone spinning up a fake/spam workspace with just a phone number.

1. First contact with signup intent triggers a **guided** intake (deterministic state machine, not
   the free-form Gemini artifact path — this needs precise ordered fields, not an LLM improvising
   sequence): church name, admin's name and role, city, rough congregation size.
2. On completion: an `organizations` row is created with `status = 'pending_approval'`, and Chertt
   sends a WhatsApp message to every number on a small **platform-admin allowlist** (not hardcoded
   to one person — a short list, configurable): `"New church pending: <name>, <admin>, <phone>,
   <city>, ~<size> members. Reply APPROVE <code> or REJECT <code>."` The code disambiguates when
   multiple signups are pending at once.
3. The requester gets an honest holding message, not silence, while pending.
4. On `APPROVE <code>`: organization flips to `active`, the first workspace (branch) is created,
   the requester is granted Organization Admin + Senior Pastor on it, and they receive an
   activation message with next steps.

## Post-approval setup — still conversational, not a form

Same guided-flow pattern for: giving categories (one message, comma-separated, parsed), ministry
units (same pattern), optional additional branches. Adding a branch takes a name, city, and the
branch admin's phone number — **that branch admin is provisioned by the org admin's own authority**,
not by re-triggering the platform-admin approval gate. Approval is a one-time trust decision at the
organization level; everything under an already-approved organization is the org admin's call.
Each branch ends the setup flow with its own shareable invite code / `wa.me` link.

## Member joining

Invite code (or a `wa.me` link with it pre-filled) as the first message → automatic member role, no
approval step — matches the client's explicit choice (self-serve member, admin-granted staff). No
code and no prior context → falls into the existing guest/demo experience unchanged.

**Real bug this design surfaces, not hypothetical:** `whatsapp_phone_links` (as it exists today)
deletes any previous link before writing a new one — one phone number can only ever belong to one
workspace. This directly breaks "the same person can belong to two churches with a number," which
the original BRD (FR-AUTH-05) always assumed and which this design requires. Fix: allow multiple
link rows per phone number (unique on `(phone_number, workspace_id)` instead of `phone_number`
alone), and track which workspace a given *conversation* is currently focused on in
`whatsapp_sessions` (`active_workspace_id`), not in the permanent link table. When a message arrives
from a number linked to more than one workspace and the active context is ambiguous, disambiguate:
*"You're in 2 churches — reply 1 for Grace Chapel or 2 for New Life Fellowship."*

## Role assignment — no screen needed

An already-established admin says, in plain language, "make Ruth Adeyemi part of the pastoral
team." Chertt resolves Ruth (by phone number if given, or by matching against known members and
confirming if ambiguous) and sets the role. The role vocabulary (finance, pastoral team, unit
leader + which unit, usher) is small and nameable — nothing about this needs a table UI. This
corrects an assumption in the earlier UI brief.

## Consent capture — no form needed

An explicit WhatsApp confirmation step, the same shape as the payment-confirm gate already built:
*"I consent to Chertt storing [child]'s information — reply YES."* Logged with a timestamp. Also
corrects an earlier assumption that this needed a web form.

## Identity edge cases — decided, not deferred

| Case | Decision |
|---|---|
| Same number, multiple churches | Session-level active-context switching + disambiguation prompt (above) |
| Shared phone (e.g. spouses) | No technical fix attempted — WhatsApp gives no per-message-sender signal within one account. Phone number stays the identity (BRD FR-AUTH-01); finer resolution leans on the person naming themselves mid-conversation. Not worth engineering around a signal Meta doesn't expose. |
| Member changes phone number | Admin-mediated relink only, not self-service — a self-service identity swap on a phone-number-as-identity system is a real takeover risk. Admin says "link 080...new to Grace's account." |
| WhatsApp reinstalled/app deleted | Non-issue on inspection — the phone number is unchanged and Chertt's session state lives server-side, not on the device. Earlier concern in this project's history was overcomplicated. |
| Admin/pastor succession, normal | Handled by role assignment (current admin reassigns) |
| Admin/pastor succession, admin unreachable/disputed | Falls back to the platform-admin allowlist — same rare, human-mediated safety valve as signup approval, not a new mechanism |

## Schema changes required

- New `organizations` table (`id`, `name`, `status` [`pending_approval`/`active`], `created_at`,
  `approved_by`, `approved_at`)
- `workspaces` gains `organization_id` (nullable during backfill, then required)
- New `organization_admins` (or equivalent) for cross-branch read access, separate from
  per-workspace membership
- `whatsapp_phone_links`: drop the delete-previous-link behavior; unique on
  `(phone_number, workspace_id)` instead of `phone_number` alone
- `whatsapp_sessions` gains `active_workspace_id` for context switching
- Platform-admin phone allowlist (env var to start; a table if the list needs to grow past a
  handful of people)
- A new guided onboarding state machine, deterministic, separate from the existing free-form
  Gemini artifact-JSON path in `ai-service.ts`

## Explicitly out of scope for this pass

- Printable invite poster generation (nice-to-have, not core path)
- Automated Paystack account creation (Paystack's own onboarding page is linked to, not replaced)
- Any change to the children's check-in scanner (already correctly scoped as the one exception)
