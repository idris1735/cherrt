# DeepSeek Prompt — Rich, Interactive Admin Dashboard Upgrade

> Direction by Claude. Make the `/admin` console **interactive, detailed, clickable, responsive, and genuinely rich** — a real SaaS command center (think Vercel / Linear / Stripe dashboards), not flat cards + tables. **Build ON what exists** (don't rebuild). TDD every new service/query; UI verified via `tsc`+`build`. Per-task commits, explicit `git add`, never break the current **463 tests**, update `CHRONICLE.md`.

## Non-negotiable principle: NO MOCK DATA
Every chart, KPI, trend, and sparkline must be fed by a **real query** over live data. A fake/placeholder chart is worse than no chart — it's the exact "feels like a mock" problem we're killing. If the data to back a visual doesn't exist yet, add the query (TDD) — don't hardcode numbers.

## What exists (extend, don't replace)
- Pages: `/admin` (overview), `/admin/churches` (+`[id]`), `/admin/people` (+`[id]`), `/admin/kyc` (+`[id]`).
- Design kit: **`src/components/admin/admin-kit.module.css`** (the current shell/sidebar/topbar/cards/tables, light+dark). Consolidate everything onto this; retire the older `src/app/admin/admin.module.css` if unused.
- Service: `src/lib/services/admin/foundation.ts` — `platformOverview`, `listChurches`, `getChurchDetail`, `getPersonDetail`, `listPeople`, `listDataRequests`.
- API: `/api/admin/{overview,churches,churches/[id],people,people/[id],kyc,kyc/[id],data-requests/[id]}`.
- Rich data available to surface: organizations, workspaces/branches, `branch_memberships` (roles), `phone_contacts` (verification L0/L1/L2), `child_profiles`+`guardianships`, `first_timers`, `prayer_requests`, `pastoral_care_requests`, `pastoral_form_submissions`, `person_milestones`, `giving_records`, `department_memberships`, `kyc_applications`, `data_requests`, consent stamps.

## Charts
- Install **`recharts`** (responsive, interactive, React) for real charts; use tiny inline **SVG sparklines** in KPI cards. Charts must be **responsive** (`ResponsiveContainer`), theme-aware (read CSS token colors), with tooltips + hover. No external CDNs.

---

## Slice 1 — The data layer (the enabler; TDD, do first)
Add to `foundation.ts` (each pure-ish, mocked-supabase tested):
- `platformTrends(period: "7d"|"30d"|"90d"|"all")` → time-bucketed series: `{ bucket, churches, members, giving }[]` (new churches, new memberships, giving sum per day/week).
- `kycFunnel()` → `{ draft, pending, approved, rejected }` counts.
- `verificationBreakdown()` → `{ l0, l1, l2 }` people counts.
- `givingTrend(period, churchId?)` → sum per bucket (optionally per church).
- `churchStats(id)` → `{ members, children, firstTimers, givingTotal, verifiedPct, pendingPastoral, branches }`.
- `activityFeed(limit)` → unified, newest-first event list `{ type, title, subtitle, at, href }` across: application submitted/approved/rejected, church created, member added, first-timer, data request. Each carries a link to drill into.
- Extend `platformOverview` to include the trend headline numbers + deltas (this period vs last) for the KPI cards.
Expose via extended `/api/admin/overview` (+ optional `?period=`) and a new `GET /api/admin/churches/[id]/stats`. All allowlist-gated.

## Slice 2 — Overview → a command center
Rebuild `/admin` as a real dashboard:
- **KPI row:** churches, members, verified %, pending KYC, giving (this period) — each card with a **sparkline** + a **delta chip** (▲/▼ vs last period) + **click → drills** into the relevant filtered list.
- **Charts:** growth over time (churches + members, area/line), giving trend (bar/area), **KYC funnel** (draft→pending→approved/rejected), **verification donut** (L0/L1/L2). All from Slice 1, all interactive (tooltips).
- **Attention panel:** pending KYC, open data requests, unverified churches — each a clickable count that jumps to the work.
- **Activity feed:** live recent events, each row clickable to its detail.
- **Period switcher** (7d/30d/90d/all) that re-queries and updates every visual.
- Skeleton loaders while fetching; friendly empty states.

## Slice 3 — Churches: rich list + tabbed detail
- **List:** client **search** (name), **filter** (status), **sort** (members/giving/created), sortable columns (name, status, branches, members, verified %, giving, created), clickable rows, sticky header, skeletons, empty state. Paginate if >50.
- **Detail (`/admin/churches/[id]`):** a header with key stats + status; **tabs** — *Overview* (per-church charts from `churchStats`/`givingTrend`: giving trend, member growth, verification), *Members* (searchable table w/ role + verification + join date), *Children* (guardians, class, allergies), *Branches*, *Pastoral* (requests + form submissions), *KYC* (the application + result chips + link to review). Quick actions where sensible (view KYC, copy join code).

## Slice 4 — People: searchable directory + rich profile
- **List:** search (name/phone), filter (verification level, has-role), sortable, clickable → profile.
- **Profile (`/admin/people/[id]`):** header (name, verification badge, churches); **tabs** — *Timeline* (the milestone timeline, richer: icons per type, dates, grouped), *Memberships* (churches + roles + units), *Family* (guardian-of / guardians), *Requests* (their prayer/pastoral/data requests), *Giving* (their records + total). Consent status visible.

## Slice 5 — KYC: a pipeline, not just a queue
- Turn `/admin/kyc` into a **pipeline view** (columns or filterable segments: Pending · Needs info · Approved · Rejected) with counts, search, and clickable cards → the existing review screen (keep it, polish spacing). Show result chips (CAC/trustee/ID) on each card at a glance.

## Slice 6 — Cross-cutting interactivity & polish
- **Sidebar:** icons + labels, active state, **collapsible**, and on mobile a **drawer** (hamburger in the topbar). 
- **Topbar:** global **search / command palette (⌘K)** that jumps to a church or person by name; theme toggle; the signed-in admin.
- **Breadcrumbs** on detail pages; **clickable everywhere** (stats, chart segments, rows → drill-downs).
- **Responsive:** every grid stacks on mobile, tables scroll in their own container, charts resize, nav becomes a drawer. Test at 375px, 768px, 1280px.
- **A11y:** labels tied to inputs, visible focus, keyboard-navigable, `prefers-reduced-motion` respected.
- **Motion:** tasteful — hover elevations, chart animate-in, skeleton shimmer. Nothing gratuitous.

## Performance
Some current queries are per-entity (`listChurches` counts memberships in JS; `getChurchDetail` does several round-trips). For the richer views, batch where you can (fetch memberships/giving once and roll up in JS is fine at current scale; note any obvious N+1 for a later optimization). Charts fetch aggregated series, not raw rows.

## Build order & acceptance
Slice 1 (data) → 2 (overview) → 3 (churches) → 4 (people) → 5 (kyc) → 6 (interactivity/responsive). Each ends green (its tests + full suite + `tsc` + `build`), merged to `main`. **Done when:** the overview is a live, drill-through command center with real charts; churches and people have searchable lists + tabbed rich detail; KYC is a pipeline; the whole thing is responsive to mobile with a command palette — and **every number/visual traces to a real query** (no mock data anywhere). Report back per slice with what each visual is fed by, so Claude can verify it's real.
