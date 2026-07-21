# Identity & Tenancy Spine — Design Spec

**Date:** 2026-07-21
**Status:** Design (awaiting user review before implementation plan)
**Supersedes context:** confirms WhatsApp-is-the-product / web-is-admin-only (per today's CHRONICLE.md), retiring the 2026-06-06 "dual-surface, dashboard first-class" framing.

---

## 1. Problem & Context

Chertt's vision is a "magic backend": one official WhatsApp number, many branches under one organization, many people under each branch — and the engine must correctly know **who is speaking, which church/branch they belong to, and what they're allowed to do**, at a high work rate, with WhatsApp as the only product surface.

### What already exists on the ground (reuse, do not rebuild)
- **Tenancy hierarchy is correct:** `organizations` (church/business) → `workspaces` (branches, via `organization_id`). A single-site church is one branch under one org — no special-casing.
- **One phone → many branches** works: `whatsapp_phone_links` keyed on `(phone_number, workspace_id)` with a synthetic PK; `user_id` nullable (phone is identity, web account optional).
- **Org-admin cross-branch layer** exists (`organization_admins`), powering the cross-branch roll-up report.
- **Onboarding choreography works end-to-end:** guided church signup → platform-admin `APPROVE <code>` → auto-provision first branch + grant owner → post-approval setup (giving categories, ministry units, add-branch loop) → emits member `JOIN` code + per-branch `ADMIN` codes. Member join-by-code and branch-admin claim-by-code both function.
- **Active-branch tracking + disambiguation:** `whatsapp_sessions.active_workspace_id` + numeric "which church is this about?" menu.

### The real gaps (this spec closes them)
| Vision | Gap in current code |
|---|---|
| Onboard the pastor, finance, children's church… | `user_role` is free text, effectively only `owner`/`admin`/`member`. Signup **collects** `admin_role` ("Senior Pastor") then **discards** it. No role vocabulary, no per-role capability scoping in the identity layer. |
| Identify a *user* to its church | Works at phone→branch level. No unified *person*: the same human in two branches is two unrelated rows. |
| Shared phone (husband + wife) | Not handled — identity is the phone number; one phone = one name = one person. |
| Member changes number | Identity does not survive — phone is the PK/lookup everywhere; a new number is a brand-new stranger. |
| Rich member profiles | `JOIN` captures just a name (often blank) + hardcoded `member`. |
| One authority model | Split-brain: WhatsApp uses `whatsapp_phone_links`; web uses a separate `memberships` table; `getApproverPhone` reaches across them. Not reconciled. |

## 2. Decisions

1. **Person-centric identity.** A human is the entity; phone numbers are contact methods pointing at them; role/membership is `(person × branch)`. (Only model that makes number-change survivable and shared-phone / same-human-across-branches expressible.)
2. **Curated role catalog per vertical → capability bundles**, enforced by the engine via the existing `policy-guard`. Admins pick from the catalog; they don't invent roles.
3. **Schema-ready, hard behaviors phased.** The schema supports shared-phone and number-change from day one; v1 runtime keeps the simple "this active phone = this person" path. Dedicated flows for who's-speaking and OTP number-change come in a fast follow-up.
4. **Additive migration.** Backfill from live data, dual-read through a compatibility view during cutover, retire the old table after. Zero data loss.
5. **Basic deterministic assign-role in v1.** An admin can change an existing member's role via a guided, list-based path (no fuzzy name-matching, no privilege escalation). Natural-language role assignment stays with the agent later.

## 3. Data Model

### Tenancy (unchanged — keep)
`organizations` → `workspaces` (branches).

### Identity (new)
```
people                     the human — stable identity
  id · full_name · preferred_name(null) · auth_user_id(null → auth.users) · created_at

phone_contacts             contact methods → point at a person
  id · phone_number · person_id → people · status('active'|'retired') · verified_at(null) · created_at
  -- v1: PARTIAL UNIQUE (phone_number) WHERE status='active'  → one active person per phone now.
  -- number-change = retire old row, insert new row → same person_id.
  -- relaxing that one partial index later = the entire "shared phone" unlock.

branch_memberships         a human's role in one branch (single source of truth)
  id · person_id → people · workspace_id → workspaces · role(text, catalog-checked)
     · unit(null, for dept_leader scoping later) · status('active'|'left') · created_at
  -- UNIQUE (person_id, workspace_id)

organization_admins        cross-branch oversight (exists → add person_id)
  organization_id → organizations · person_id → people
```

### Role → capability mapping (in code, not DB)
A `ROLE_CATALOG` keyed by vertical (`church` | `sme` | `store` | `events`), each role mapping to a capability bundle, consumed by `policy-guard`. Adding/altering a role is a code change + review, mirroring the existing 29-capability registry. Initial church catalog:

| Role | Capability bundle (summary) |
|---|---|
| `senior_pastor` | everything in-branch + org oversight + assign-role |
| `pastor` | pastoral care, view reports, approve, assign-role (≤ own level) |
| `finance` | giving, expenses, approve spend, view financial reports |
| `secretary` | members, documents, announcements, appointments |
| `children` | child check-in only |
| `dept_leader` | own unit: attendance, requests |
| `member` | give, ask, register, request, report |

SME vertical initial catalog: `owner` · `manager` · `finance` · `staff`. (Store/Events catalogs stubbed, filled when those modules are wired.)

## 4. Identity Resolution (runtime)

A single pure, testable resolver replaces `lookupAllPhoneLinks` / `resolveActivePhoneLink`, turning an inbound phone into everything the engine needs:

```
phone → normalizePhoneNumber → phone_contacts(status='active') → person
      → branch_memberships(person, status='active')
          none  → prompt to JOIN
          one   → active branch
          many  → disambiguation menu (reuse whatsapp_sessions.active_workspace_id + numeric UX)
      → role → ROLE_CATALOG bundle → capabilities
      → organization_admins(person)? → cross-branch oversight (powers roll-up report)
```

`whatsapp_phone_links` becomes a **compatibility view** over the new tables during cutover, so existing call sites keep working while they're migrated deliberately; then it's retired.

## 5. Onboarding — evolve existing flows (person- and role-aware)

The choreography and step vocabularies stay; provisioning becomes person/role aware:
- **Church signup:** on approval, create `Person` (from admin name), `phone_contact`, `branch_membership(role = senior_pastor)`, `organization_admin(person)`. The founding admin is always seated as `senior_pastor` (they own the org). The `admin_role` free-text answer the flow already collects — currently discarded — is **retained on the person** as their `preferred_name`-adjacent descriptive title for AI context/display; it does not override the seated authority role. (Rationale: the founder's authority is fixed by the fact that they created the org; their typed title is descriptive colour, not a security input.)
- **Post-approval setup:** unchanged (categories, units, branches).
- **Branch `ADMIN <code>` claim:** create/attach Person + `branch_membership` for that branch, with the role set to the **vertical's branch-lead role** from the catalog — church → `pastor`, SME → `manager`. (No `owner` role is minted per-branch; org-level ownership stays with the `organization_admins` layer.)
- **Member `JOIN <code>`:** create/attach Person + `branch_membership(role = member)`. Now a real human that can accrue further memberships/roles across branches.

Attach-vs-create rule everywhere: if the inbound phone already resolves to an active person, **attach** a new membership to that person rather than creating a duplicate human.

## 6. Assign-Role Capability (v1, deterministic)

Lets an authorized admin change an existing member's role without the agent.
- **Trigger:** a guided flow (e.g. an "assign role" / "change role" intent, or an admin action). No fuzzy free-text name resolution in v1.
- **Steps:** list current branch members (numbered) → admin picks one → list catalog roles valid for this vertical (numbered) → admin picks → confirm → update `branch_memberships.role`.
- **Guards:**
  - Actor must hold the `assign-role` capability in that branch.
  - **No privilege escalation:** an actor cannot grant a role whose bundle exceeds their own (e.g. a `pastor` cannot mint a `senior_pastor`).
  - Target must already be an active member of the branch (assign *changes* an existing membership; inviting a brand-new person directly into a role — role-scoped invite codes — is noted as a phase-2 extension).
- **Audit:** each change writes who/what/when (reuse existing logging pattern).

## 7. Error Handling & Edge Cases
- Unlinked phone → existing guest/demo flow, unchanged.
- Person exists but no active membership → prompt to JOIN.
- Multi-branch person → disambiguation menu (existing UX, now over `branch_memberships`).
- DB unavailable → graceful empties (today's defensive pattern).
- Legacy/unknown role value → default to `member` capabilities + log a warning.
- Phone already active-linked to a different person (should not occur under the v1 partial-unique) → reject + flag for manual review.

## 8. Migration (additive, zero data loss)
1. Create new tables (`people`, `phone_contacts`, `branch_memberships` — a fresh table, **not** an evolution of the web-only `memberships` table, which is reconciled into it in step 4) and add `organization_admins.person_id`.
2. **Backfill:** each distinct phone in `whatsapp_phone_links` → one `person` (name from `user_name`) + one active `phone_contact` + one `branch_membership` per link row (role mapped from `user_role`; unknown → `member`).
3. `organization_admins.phone_number` → resolve to `person_id` via `phone_contacts`.
4. Reconcile web `memberships` (user_id/email) into people by `auth_user`/email match; carry role/title; flag unmatched for manual review (do not silently drop).
5. Recreate `whatsapp_phone_links` as a **view** over the new tables; keep call sites working.
6. Migrate call sites (whatsapp-processor, whatsapp-workspace helpers) to the new resolver.
7. Retire the old table once no code reads it directly.

## 9. Testing
- Pure resolver unit tests (as `resolveActivePhoneLink` is tested today): person / no-membership / one / many-disambiguation / guest.
- Role → capability tests per vertical, including the privilege-escalation guard.
- Onboarding-provisioning tests: signup → person + `senior_pastor`; member join → person + `member`; admin claim → person + branch role.
- Assign-role tests: happy path, escalation blocked, non-member target rejected, unauthorized actor blocked.
- Migration test against a snapshot of the current `whatsapp_phone_links` shape → assert people/contacts/memberships produced correctly and no rows dropped.

## 10. Explicitly Out of Scope (v1 — schema-ready, behavior later)
- Shared-phone "who's speaking" runtime resolution.
- Full self-serve OTP number-change flow (schema supports retire/attach; the guided verified UX is phase 2).
- Fuzzy natural-language role assignment ("make Ruth from the choir a leader") — agentic engine's job.
- Role-scoped invite codes (invite a brand-new person directly as finance/children) — phase 2 extension of assign-role.
- Full web sign-in reconciliation beyond the `people.auth_user_id` schema link.
- Per-unit capability sub-scoping for `dept_leader` beyond a single `unit` field.

## 11. Future Phases (context, not built here)
Shared-phone resolution · verified number-change · role-scoped invites · NL role assignment (agent) · web-auth reconciliation. Each is a follow-up sub-project once this spine is proven — this is the foundation the agentic engine, workflow engine, and modules all sit on.
