# Cross-Branch Org-Admin Reporting — Design

**Date:** 2026-07-20
**Status:** Approved, implementation starting
**Related:** `docs/superpowers/specs/2026-07-18-whatsapp-native-onboarding-design.md`

## Problem

An organization admin overseeing multiple branches (workspaces) under one organization has no way
to see combined numbers across them. `whatsapp-reports.ts` (`matchReportIntent` / `buildReport`) is
entirely single-workspace-scoped — every query answers for the one workspace the sender's phone is
linked to. `getOrganizationWorkspaces(phoneNumber)` in `whatsapp-workspace.ts` already exists and
returns the branches an org admin can see, but it is dead code — nothing calls it.

v1 scope, per explicit user decision: only two report types get an org-wide variant — **overview**
and **giving**. The other 7 report types (customers, sales, expenses, requests, inventory, wallet,
issues) stay single-workspace-only in v1. Separately, "expenses"/"requests"/"issues" are empty for
real (non-guest) workspaces today regardless of scope — a pre-existing gap, not touched here.

## Architecture

Same separation `whatsapp-reports.ts` already has: it stays a pure formatter with no Supabase I/O,
and `whatsapp-processor.ts` does all fetching. Two new pure functions are added to
`whatsapp-reports.ts`, given pre-fetched per-branch data:

```typescript
export type OrgReportKey = "org-overview" | "org-giving";

export type OrgBranchOverview = { id: string; name: string; metrics?: ComputedMetrics };
export type OrgBranchGiving = { id: string; name: string; givingSummary?: GivingSummary };

export function matchOrgReportIntent(text: string): OrgReportKey | null { ... }
export function buildOrgOverviewReport(branches: OrgBranchOverview[]): { text: string; buttons?: Array<{ id: string; title: string }> } { ... }
export function buildOrgGivingReport(branches: OrgBranchGiving[]): { text: string; buttons?: Array<{ id: string; title: string }> } { ... }
```

`metrics`/`givingSummary` being `undefined` on a branch means that branch's fetch failed — the
formatter renders a "⚠️ couldn't load" line for that branch instead of dropping it silently or
throwing.

## Trigger phrases & access gate

`matchOrgReportIntent` reuses the existing `CREATE_VERBS` guard (so "log an expense across all
branches" still routes to creation, not a report), then matches:

- **org-overview**: "all branches", "across branches", "across all branches", "every branch", "org
  overview", "organization overview" — unless the message also mentions giving/tithes/offerings, in
  which case it's org-giving.
- **org-giving**: any of the above phrases combined with "giving", "tithe(s)", or "offering(s)" —
  e.g. "giving across all branches", "total tithes across branches", "org giving".

In `whatsapp-processor.ts`, this check runs before the existing `matchReportIntent` block (the
phrase sets don't overlap, but org intent is more specific so it's checked first). A match alone
isn't enough to serve the report — the sender's phone must resolve to at least one organization
branch via `getOrganizationWorkspaces(from)`. If it resolves to zero branches (not an org admin, or
an org admin with only the single branch they're already scoped to), reply with a plain text
explanation — "This is for organization admins overseeing more than one branch." — and stop, rather
than falling through to the free-form Gemini path.

## Output format

Combined totals first, per-branch breakdown below. No combined delta-% on the sales line —
averaging each branch's independent percentage change would be mathematically invalid, unlike the
single-branch overview which does show one (it has only one branch's true delta to report).

```
📊 *All Branches — Overview*

💰 Sales this month (combined): ₦X
👛 Wallet (combined): ₦X · 👥 Customers (combined): X
🧾 Pending: X · Open issues: X · Low stock: X

*By branch*
• Grace Chapel — Lagos: ₦X sales
• Grace Chapel — Abuja: ₦X sales
• Grace Chapel — Enugu: ⚠️ couldn't load
```

```
🙏 *All Branches — Giving*

• This month (combined): ₦X from N gifts

*By branch*
• Grace Chapel — Lagos: ₦X (N gifts)
• Grace Chapel — Abuja: ₦X (N gifts)
```

Each report gets one button to flip to the other ("Giving (all branches)" / "Overview (all
branches)"), using button IDs `rpt:org-overview` / `rpt:org-giving`, mirroring how existing reports
cross-link via `rpt:<key>`.

## Data flow / call-site changes

`whatsapp-processor.ts`:

- Import `matchOrgReportIntent`, `buildOrgOverviewReport`, `buildOrgGivingReport` from
  `whatsapp-reports.ts`; `getOrganizationWorkspaces` from `whatsapp-workspace.ts`; `computeMetrics`
  from `business-metrics.ts` (the last two aren't currently imported there).
- New block ahead of the existing `matchReportIntent` block (~line 791): if `matchOrgReportIntent`
  matches, call `getOrganizationWorkspaces(from)`. If empty, send the plain-text explanation and
  return. Otherwise, `Promise.all` over branches:
  - org-overview: `loadWorkspaceData(b.id).catch(() => undefined)` → `computeMetrics(data, "month")`
    if data loaded, else `undefined`.
  - org-giving: `getGivingSummary(b.id).catch(() => undefined)`.
  Then call the matching formatter and send via `sendInteractiveButtons` (falling back to
  `sendTextMessage` on failure, same pattern as the existing report dispatch).
- Button handler (~line 484, the `buttonId.startsWith("rpt:")` block): add a branch for
  `rpt:org-overview` / `rpt:org-giving` ahead of the existing generic handler, since org reports
  need `getOrganizationWorkspaces(from)` rather than `link.workspaceId`. Same fetch-then-format
  logic as the text-trigger path, reused as a small local helper to avoid duplicating the
  `Promise.all` block.

## Error handling

Per-branch fetch failures are caught individually (`.catch(() => undefined)`) so one bad branch
doesn't fail the whole report — that branch just renders as "couldn't load" per the output format
above. If `getOrganizationWorkspaces` itself throws, catch it the same way and fall back to zero
branches, which produces the "not an org admin" message rather than a crash.

## Testing

- `matchOrgReportIntent`: phrase coverage for both keys, `CREATE_VERBS` guard still blocks creation
  phrasing, non-matching text returns `null`.
- `buildOrgOverviewReport` / `buildOrgGivingReport`: pure formatter tests with fixture branch
  arrays — combined totals sum correctly, per-branch lines appear in order, a branch with
  `metrics`/`givingSummary` undefined renders the fallback line instead of throwing or being
  dropped.
- `whatsapp-processor.test.ts`: one test for the org-admin-with-branches path (mocks
  `getOrganizationWorkspaces` to return 2 branches, asserts the combined report is sent) and one for
  the zero-branches path (asserts the plain-text explanation is sent instead), following the
  existing `vi.spyOn` mocking pattern already used for `whatsapp-workspace` in that file.

## Explicitly out of scope

- Org-wide variants of the other 7 report types (customers, sales, expenses, requests, inventory,
  wallet, issues) — v1 is overview + giving only, per explicit user decision.
- Fixing the pre-existing gap where expenses/requests/issues reports are empty for real (non-guest)
  workspaces — unrelated, not touched here.
- A combined delta-% on the org-wide sales line — mathematically invalid to average per-branch
  percentages, so it's omitted rather than faked.
- Drilling down from an org report into one specific branch's own single-workspace report (e.g.
  tapping "Lagos" to jump straight to its normal overview) — the existing single-workspace reports
  remain reachable the normal way (message from a phone linked to that branch), just not
  cross-linked from the org view in v1.
