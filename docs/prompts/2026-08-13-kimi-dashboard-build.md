# Prompt for Kimi — Build the Chertt Admin Dashboard (complete, rich, self-contained HTML)

You are a senior product designer + front-end engineer. Build a **COMPLETE, visually rich, interactive admin dashboard** as a **self-contained HTML/CSS/JS prototype** that will be lifted into a Next.js app. It must look like a premium SaaS console — **Vercel / Linear / Stripe caliber**: polished, information-dense, professional, delightful. Use realistic sample data. No build step, no frameworks — plain HTML, CSS, and vanilla JS. This is the internal "control room" for **Chertt**, a WhatsApp-first church-management platform for the Nigerian market; the web app is **admin-only** (the Chertt platform team monitors churches, reviews KYC, manages people).

## Deliverable
- Every screen below, fully built. Either one HTML file with a simple hash-router between sections, or one HTML per screen sharing a CSS file — your call, but **complete pages, not fragments.**
- Charts via **inline SVG** (preferred) or Chart.js from a CDN, clearly marked for later replacement.
- Written to be **easy to lift into React/Next**: semantic markup, clean class names, CSS custom properties, minimal and clearly-separated JS, and HTML comments marking where real data and charts bind (see Handoff).

## Design system — USE THESE EXACT TOKENS (so integration is trivial)
Define as CSS custom properties and use them everywhere (don't hardcode hex where a token exists):
```
--bg:#fafafa; --surface:#ffffff; --surface-muted:#fafafa; --ink:#171717; --muted:#737373;
--line:#ebebeb; --accent:#fa8300; --accent-soft:#fff4e8;
--radius-sm:10px; --radius-md:12px; --radius-lg:14px; --radius-xl:16px;
--shadow:0 1px 2px rgba(0,0,0,.04);
```
**Dark mode is first-class:** provide a full dark palette mapped to the SAME token names, active on both `[data-theme="dark"]` and `@media (prefers-color-scheme:dark)`. Font: system sans (`-apple-system, "Segoe UI", Inter, sans-serif`), tight, **tabular numerals** for all figures. Semantic status colors (green/amber/red) are separate from the orange accent. Hairline `--line` borders, ~10px radii, minimal shadows, generous whitespace, orange only on primary actions + active nav. Both themes must look excellent.

## The screens — build ALL, richly
1. **App shell:** collapsible left **sidebar** (Overview · Churches · People · KYC · Data requests · Settings — icon + label + active state), a **topbar** (global search that opens a **⌘K command palette**, a theme toggle, a signed-in admin avatar + menu), content area. On mobile the sidebar becomes a slide-in **drawer** (hamburger in topbar). **Breadcrumbs** on detail pages.
2. **Overview (command center):** a **period switcher** (7d / 30d / 90d / all); a **KPI row** — Churches, Members, Verified %, Pending KYC, Giving (₦) — each card = big tabular number + a **▲/▼ delta chip** vs last period + a mini **sparkline**; a **charts grid** — church + member **growth** (area/line), **giving trend** (bar/area), **KYC funnel** (draft→pending→approved→rejected), **verification donut** (L0/L1/L2); an **attention panel** (pending KYC · open data requests · unverified churches — clickable counts); a **recent-activity feed** (application submitted / approved, new church, data request — each row: icon + title + subtitle + relative time, clickable). Every KPI and chart segment should read as clickable (drill-down).
3. **Churches list:** toolbar (search, status filter, sort); a dense **sortable table** (name, status badge, branches, members, verified %, giving ₦, created) — clickable rows, hover states, sticky header; skeleton + empty states; pagination if long.
4. **Church detail:** header (name, status badge, key stats); **tabs** — *Overview* (per-church giving + member-growth charts + verification), *Members* (searchable table: name, role, verification level, joined), *Children* (guardian, class, allergies), *Branches*, *Pastoral* (requests + form submissions), *KYC* (application + **CAC / trustee / ID** result chips). Quick-action buttons.
5. **People directory:** search + filters (verification level, has-role); sortable table → clickable rows.
6. **Person profile:** header (name, verification badge, churches); **tabs** — *Timeline* (a vertical **milestone timeline**, icon per event type — salvation, baptism, dedication, joined — with dates), *Memberships* (churches + roles + units), *Family* (guardian-of / guardians), *Requests* (prayer / pastoral / data), *Giving* (records + total); **consent status** shown.
7. **KYC pipeline:** a four-column **board** (Pending · Needs info · Approved · Rejected) with counts; each card shows church + applicant + **result chips** (CAC / trustee / ID) at a glance; clicking a card opens →
8. **KYC review screen:** side-by-side **selfie / government ID photo / CAC certificate** with **click-to-zoom**; result cards (CAC found, trustee match, NIN verified); applicant + church details; prominent **Approve** (green) / **Reject** (with reason) with a confirm dialog.
9. **Data requests + Settings:** a table of privacy/deletion requests with a "Mark done" action; a simple Settings page (admin allowlist, theme).

## Interactivity (vanilla JS)
Tabs; table sort + filter + search; the period switcher (swaps chart datasets); the **⌘K command palette** (fuzzy filter over sample churches/people, arrow-key nav, Enter to go); sidebar collapse + mobile drawer; theme toggle (persist to `localStorage`, set `data-theme`); click-to-zoom on KYC photos; chart hover tooltips; skeleton shimmer on load; toast on actions. Motion tasteful (chart animate-in, hover elevation) and **`prefers-reduced-motion`-safe**.

## Sample data — realistic Nigerian church context
~8 churches (e.g. Grace Chapel, Living Faith Ikeja, House on the Rock Lekki, RCCG City of David…); members with Nigerian names; **giving in ₦** with believable amounts; verification levels (L0/L1/L2); a handful of children; first-timers; pastoral requests; milestones; a KYC pipeline with a few applications in each stage; time-series that make the charts look real. Make sample data obvious so it's clear what gets replaced.

## Quality bar
Pixel-tight spacing, real typographic hierarchy, dense but breathable, delightful hover/focus, **fully responsive at 375 / 768 / 1280**, **light + dark both excellent**, accessible (labels tied to inputs, `:focus-visible`, keyboard-navigable). It should make a serious client lean in. No lorem — real-feeling content everywhere.

## Handoff notes (make the DeepSeek integration painless)
- Use the CSS token variables above; keep markup **semantic + class-based**; avoid inline styles except genuinely dynamic ones.
- Isolate JS by concern. At each data-binding point, add a comment naming the **real endpoint** it maps to (these already exist and return live data):
  `/api/admin/overview` · `/api/admin/churches` · `/api/admin/churches/[id]` · `/api/admin/churches/[id]/stats` · `/api/admin/people` · `/api/admin/people/[id]` · `/api/admin/kyc` · `/api/admin/kyc/[id]` · `/api/admin/data-requests/[id]` · `/api/admin/search`
  e.g. `<!-- WIRE: /api/admin/overview -> kpis, trends, funnel, verification, activity -->`
- Mark every chart `<!-- CHART: recharts area|bar|donut|line -->` so it maps cleanly to recharts.
- Keep each screen's DOM self-contained so it can become one React component.
