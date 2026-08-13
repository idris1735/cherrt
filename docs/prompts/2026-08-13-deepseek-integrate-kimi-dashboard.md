# DeepSeek Prompt — Integrate the Kimi dashboard into the Next.js admin (reskin + wire real data)

> Direction by Claude. Kimi produced a complete, self-contained HTML dashboard (owner will provide it). Your job: make the real `/admin` console **look like that design and wire every screen to the existing live data.** This is a **reskin + rewire — NOT a backend rebuild.** Keep the proven data layer, API routes, auth, recharts, and the current **488 tests** green. TDD any new mapping logic; per-slice commits; `tsc`+`build`+suite green; update `CHRONICLE.md`.

## THE #1 RULE — zero sample data survives
Kimi's HTML ships with a `const DATA = {...}` sample object (churches, people, KYC, Unsplash photos, hardcoded consent dots). **None of it may remain in the shipped app.** Every screen fetches its real endpoint; every chart is fed by a real query. A single leftover Kimi number, name, or Unsplash image is the exact "feels like a mock" failure we are eliminating. If a visual can't be wired to real data yet, wire it to the closest real query — never hardcode.

## KEEP (already built + tested — reuse, don't touch the logic)
- **Data layer** `src/lib/services/admin/foundation.ts`: `platformOverview`, `listChurches`, `getChurchDetail`, `getPersonDetail`, `listPeople`, `listDataRequests`, `platformTrends`, `kycFunnel`, `verificationBreakdown`, `givingTrend`, `churchStats`, `memberTrend`, `activityFeed`, `adminSearch`.
- **API routes** `/api/admin/{overview,churches,churches/[id],churches/[id]/stats,people,people/[id],kyc,kyc/[id],data-requests/[id],search}`.
- **Auth**: `adminFetch` + `platformAdminEmail` gating (every page stays gated; 401 → not-authorized screen).
- **recharts** + `src/components/admin/charts.tsx`.
- All existing tests must stay green.

## REPLACE (the UI layer only)
The admin shell (`shell.tsx`/`sidebar.tsx`/`topbar.tsx`), the pages (overview, churches, people, kyc, data-requests, settings), and the kit CSS — rebuilt to Kimi's design.

## Step 0 — save the design
Save the owner-provided Kimi HTML to `docs/design/kimi-dashboard.html` (version-controlled reference).

## Step 1 — design tokens & theme (do first)
- Kimi adds tokens the app doesn't have: `--surface-elevated`, `--muted-light`, `--line-strong`, `--accent-hover`, `--success`/`-soft`, `--warning`/`-soft`, `--danger`/`-soft`, `--info`/`-soft`, `--font-mono`, `--sidebar-width`, `--sidebar-collapsed`, `--topbar-height`, `--transition`, extra shadows. **Add them all** to `globals.css` `:root` (light) AND the dark block, with Kimi's dark values.
- **Theme attribute conflict:** the app themes via `html[data-chertt-theme]`; Kimi's CSS keys off `[data-theme]`. **Standardize on `data-theme`** — update the app's theme toggle + the FOUC preloader script to set `data-theme`, port the existing dark palette onto it, keep the `prefers-color-scheme` fallback. Do **not** leave two competing theme systems.

## Step 2 — CSS kit
Move Kimi's `<style>` into the admin stylesheet (extend `admin-kit.module.css` or a global `/admin` stylesheet), preserving class names so the markup ports cleanly. **Remove `<base target="_blank">`.** Keep everything token-driven (no raw hex where a token exists).

## Step 3 — shell
Rebuild Sidebar / Topbar / AdminShell from Kimi's markup as React components: collapsible sidebar + mobile drawer, topbar with ⌘K trigger + theme toggle + signed-in admin, command palette, photo-zoom modal, confirm dialog, toasts. Wire:
- Nav → Next `<Link>` + `usePathname` active state (replace the hash router + inline `onclick`).
- Theme toggle → the app's theme mechanism (Step 1).
- **Signed-in admin identity → the real Supabase session email** (not "Tolu O.").
- **Command palette → debounced `/api/admin/search`** (not Kimi's in-memory `cmdItems`).

## Step 4 — pages (each `renderX()` → a React client component fetching real data)
Fetch via `adminFetch` (auth-gated) and **map the real shape → Kimi's markup**. Replace every inline-SVG chart with **recharts** (per each `<!-- CHART: recharts X -->`) fed by the real series. Keep skeleton / empty / error states.

Real → markup mapping (and the mismatches to handle):
- **Overview** ← `/api/admin/overview` (`kpis` with deltas + sparks), `platformTrends` (growth + giving), `kycFunnel`, `verificationBreakdown`, `activityFeed`, attention counts. Map the nested overview shape onto Kimi's flat KPI cards.
- **Churches list** ← `/api/admin/churches` (name, status, branches, members, verifiedPct, giving, created).
- **Church detail** ← `/api/admin/churches/[id]` (+ `/stats`): tabs Overview (`givingTrend`+`memberTrend` as recharts), Members, Children, **Branches**, **Pastoral**, KYC (chips from the app's real cac/trustee/id derivation).
- **People list** ← `/api/admin/people`; **profile** ← `/api/admin/people/[id]`: Timeline (real `milestones`), Memberships, Family, Requests, Giving, and **real consent status** (`consent_source`/`consent_version` + opt-out) — NOT Kimi's three hardcoded green dots.
- **KYC pipeline** ← `/api/admin/kyc`: columns by real status. **⚠️ `needs_info` is NOT a real status** (schema = draft/pending/approved/rejected). Collapse to the real four columns (or drop "Needs Info") — state which you chose. Chips from real `cac_result`/`id_result`/`trustee_match`.
- **KYC review** ← `/api/admin/kyc/[id]`: **real signed-URL** selfie/ID/CAC (not Unsplash), real result cards, Approve/Reject POST to the existing route with the existing confirm.
- **Data requests** ← `listDataRequests`: real kinds are **access / deletion / objection** (map Kimi's `export`→access, `correction`→objection, or add kinds — don't invent statuses). "Mark done" → the real `/api/admin/data-requests/[id]`.
- **Settings** ← the real `PLATFORM_ADMIN_EMAILS` allowlist (read-only is fine) + the theme toggle.

## Step 5 — cleanup & verify
Delete Kimi's `DATA` object and every hardcoded value; remove the hash router + inline handlers; confirm auth gating on every page. TDD any new mapping/derivation. `tsc` + `build` + full suite green (≥488). Per-slice commits. Update `CHRONICLE.md`.

## Acceptance
`/admin` looks like Kimi's design (light + dark via the app's theme), **every screen renders real data**, charts are recharts fed by real series, the command palette hits `/api/admin/search`, KYC shows real signed-URL documents, consent status is real, and **there is zero Kimi sample data anywhere in the app**. Report per screen which real query feeds it, so Claude can verify no placeholder survived.
