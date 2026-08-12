# DeepSeek Prompt — Rebuild the Chertt web app from scratch (professional admin dashboard)

> Direction by Claude. Read `docs/DEEPSEEK-HANDOFF.md` and `CHRONICLE.md` §0 first. This is a **UI-layer rebuild only** — do not change any backend logic.

## The mandate

The web app is **admin-only** ("imagine there is no web app… the magic backend"). WhatsApp is the product; the website is the Chertt team's control room. The current web UI is legacy from a scrapped dual-surface era and is causing broken routing (sign-in wanders into `/auth/onboarding`). **Scrap it and rebuild ONE professional platform-admin dashboard + a clean sign-in.** Think Vercel / Linear / Supabase dashboards — persistent sidebar, top bar, dense tables, tasteful. Not a thin single-column page.

## Hard rules

- **Do NOT touch the backend.** Everything under `src/lib/services/**` (identity, agent, kyc, admin/foundation, whatsapp-*), all `src/app/api/**` route handlers, and all migrations stay exactly as they are. Keep the API contracts (`/api/admin/*`, `/api/onboard/*`) unchanged — you are only rebuilding what renders them.
- **TDD** any new service/route logic; verify pages via `npx tsc --noEmit` + `npm run build`. Never break existing tests (currently 414 passing). Per-task commits, explicit `git add` paths, update `CHRONICLE.md` §0.
- Light **and** dark themes. Chertt orange (`--accent`) used sparingly (primary action / active nav only). Reuse/extend the `:root` tokens in `globals.css`.

## Keep vs delete

**KEEP (rebuild the UI, keep the routes):**
- `/admin/*` — the platform dashboard (overview, churches, church detail, KYC list/detail). Same data/API, far better UI in the new shell.
- `/onboard/[token]` — the public applicant KYC form (restyle to the new system; it's the church-owner entry point).
- `/pay/[reference]` and `/qr` — used by the WhatsApp flow; leave functional (restyle lightly).

**DELETE (legacy dual-surface leftovers — verify nothing under `src/lib/services/**` or `src/app/api/**` imports them first):**
- The entire `/w/[workspaceSlug]/**` surface: `chat`, `settings`, `modules`, and all `modules/toolkit/**`, `modules/church|events|store`.
- Legacy auth maze: `/auth/create-account`, `/auth/modules`, `/auth/onboarding`, `/auth/setup`.
- Dead demo/seed data if unused after teardown: `src/lib/data/demo-*.ts`, `whatsapp-demo-data.ts`, and any now-unreferenced components/hooks/providers. Prune unused deps.

## Build slices (small, in order — each its own commit, tsc+build green)

1. **Design-system kit + app shell.** A proper component kit (Sidebar, TopBar with user + sign-out, Card, StatCard, Table, Badge, Button, Input, Dialog, Toast, EmptyState, Skeleton) on the `:root` tokens; light+dark; responsive (sidebar collapses on mobile). A single `AdminShell` layout used by every dashboard page.
2. **Auth, fixed.** One clean Supabase sign-in page → on success land on `/admin`. Platform-admin check via the existing `platformAdminEmail`/`PLATFORM_ADMIN_EMAILS`; non-admins get a clear "not authorized" screen. **Remove the redirect that sends sign-in → onboarding.** No onboarding pages in the web app.
3. **Overview** rebuilt in the shell (stat cards + recent activity from `/api/admin/overview`), with loading/empty/error states.
4. **Churches** list + **church detail** (members, roles, verification levels) from `/api/admin/churches[/id]`.
5. **KYC** list + review detail (selfie beside Mono ID photo; approve/reject) from `/api/admin/kyc[/id]` — same behavior, new UI.
6. **People** — a new view listing people across churches (name, verification level, churches/roles). Add a `listPeople()` to `src/lib/services/admin/foundation.ts` (TDD) + `GET /api/admin/people` (gated) to back it.
7. **Teardown** — delete the legacy surface from "Keep vs delete", prune dead code/deps, confirm `tsc` + `build` + tests all green.
8. **Restyle `/onboard/[token]`** to the new design system (keep all logic).

## Design direction

Professional SaaS console: fixed left sidebar (Overview · Churches · KYC · People · Settings), top bar (workspace/name + theme toggle + sign-out), roomy content with clear hierarchy, tabular data with `font-variant-numeric: tabular-nums`, subtle hover/focus states, real empty/loading/error states everywhere. Semantic status colors (green/amber/red) separate from the orange accent. Aim for something you'd be proud to show a client — polished, not decorative.

## Out of scope

No church-facing web dashboard (church leaders use WhatsApp). No new backend features. No payments work. Don't invent product scope — if something's ambiguous, leave a `// TODO(claude): <question>` and flag it rather than guessing.
