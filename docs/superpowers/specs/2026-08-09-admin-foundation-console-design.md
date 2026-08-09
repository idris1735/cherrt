# Platform-Admin Foundation Console — Design

**Phase:** 1 (Foundation), final slice — "the admin dashboard that makes the foundation visible."
**Status:** Approved (brainstorming) → plan next.

## Problem

Phase 1 built the foundation (identity, roles, KYC, tiered access) but the only web-visible admin surface is `/admin/kyc` (pending applications). The owner (Kola) asked for an admin **dashboard so the foundation is visible** — the "magic backend" console showing the churches, people, roles, and verification state that the WhatsApp product created. Web is admin-only (project direction); this console is that admin view. Read-only for now — all mutations stay in WhatsApp.

## Design system (Vercel-minimal, light) — scrap the previous ad-hoc UI

Reuse the existing `:root` tokens already in `globals.css` (they are already the intended system): `--bg #fafafa`, `--surface #ffffff`, `--ink #171717`, `--muted #737373`, `--line #ebebeb`, `--accent #fa8300` (orange, used sparingly), `--shadow` (1px, near-none), radii `--radius-sm 10px`…`--radius-xl 16px`, font `--font-sans` ("Segoe UI"/system). One shared CSS module (`src/app/admin/admin.module.css`) turns these tokens into a small component kit: page shell, top nav, stat card, table, status badge, primary/ghost button, empty state. **The dark-green inline styles on the current KYC/onboard pages are removed and replaced by this kit** so the whole `/admin` console (and the public onboard form) is one coherent, minimal, light dashboard.

Look: near-white ground, hairline `--line` borders, near-black `--ink` text, muted labels, ~10px radii, effectively no shadows/gradients, orange only on the primary action and the active nav item. Data-dense tables over decorative cards. Status badges: active = green, pending = amber, rejected = red — semantic, not the accent.

## Surface

Shared `/admin` layout (top nav: **Overview · Churches · KYC**, active-aware) wrapping all admin pages. Same `PLATFORM_ADMIN_EMAILS` gate as KYC: client pages read the Supabase session JWT and call server routes that enforce `platformAdminEmail`.

1. **`/admin` — Overview.** Stat cards: churches (total / active / pending), pending KYC, members (active memberships), people verified vs unverified. A recent-activity strip: latest KYC applications (status + church) and newest churches.
2. **`/admin/churches` — list.** Every organization: name, status badge, branches count, members count, created date → row links to detail. Empty → friendly placeholder.
3. **`/admin/churches/[id]` — detail.** Org header (name, status, city, created, approved-by); branches (workspaces) list; members table (name, role, verification level L0/L1/L2, joined); a link to the church's KYC application if one exists.
4. **`/admin/kyc` + `/admin/kyc/[id]`** — unchanged behavior, **restyled** to the kit.

## Server layer

`src/lib/services/admin/foundation.ts` (service-role, read-only):
- `platformOverview(): Promise<Overview>` — `{ churches: {total, active, pending}, pendingKyc, members, people: {verified, unverified}, recentKyc: RecentKyc[], recentChurches: RecentChurch[] }`.
- `listChurches(): Promise<ChurchSummary[]>` — `{ id, name, status, branches, members, createdAt }[]`.
- `getChurchDetail(id): Promise<ChurchDetail | null>` — `{ org, workspaces, members: {name, role, level, joinedAt}[], kyc: {id, status} | null }`.

Queries: `organizations`, `workspaces` (by `organization_id`), `branch_memberships` (active) joined to `people`, `phone_contacts` (verification), `kyc_applications`. Member verification level via Slice-1 `verificationLevel(personId)`. Volumes are small (controlled rollout), so simple per-entity queries are fine; no premature aggregation SQL.

Routes (all gated, Bearer token → `platformAdminEmail`): `GET /api/admin/overview`, `GET /api/admin/churches`, `GET /api/admin/churches/[id]`.

## Out of scope

No editing from the console (roles/members change in WhatsApp); no payments; no dark theme (light per direction); no deletion of the legacy toolkit module pages (separate cleanup) — but this console is the canonical dashboard going forward.

## Testing

Foundation service: overview counts + church list shape + detail assembly (mocked Supabase). Routes: 401 non-admin, 200 admin with data. Pages verified via `tsc` + `npm run build`.

## Data model reference (verified)

- `organizations(id, name, status['pending_approval'|'active'|'rejected'], requested_by_phone, requested_by_name, requested_city, requested_size, approved_by, approved_at, created_at)`
- `workspaces(id, slug, name, city, organization_id?, created_at)`
- `people(id, full_name, preferred_name, created_at)`; `phone_contacts(person_id, status['active'|'retired'], verified_at)`; `branch_memberships(person_id, workspace_id, role, status['active'|'left'], created_at)`
- `verificationLevel(personId) → 0|1|2`
