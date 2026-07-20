# Cross-Branch Org-Admin Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organization admin ask "how did we do across all branches" (or "giving across all branches") over WhatsApp and get combined totals + a per-branch breakdown, for the overview and giving report types only.

**Architecture:** Two new pure formatter functions in `whatsapp-reports.ts` (`buildOrgOverviewReport`, `buildOrgGivingReport`) plus a text matcher (`matchOrgReportIntent`) — no Supabase I/O, mirroring how `buildReport`/`matchReportIntent` already work. `whatsapp-processor.ts` does the fetching: resolve the sender's org branches via the existing (currently unused) `getOrganizationWorkspaces`, fetch each branch's metrics/giving summary in parallel, then call the formatter. Wired into both the free-text dispatch path and the `rpt:` button-navigation handler.

**Tech Stack:** TypeScript, Vitest, Next.js (no new dependencies).

## Global Constraints

- v1 covers exactly two report types: overview and giving. No other report type gets an org-wide variant.
- No combined delta-% on the org-wide sales line — only single totals, per the spec's explicit math-validity call.
- A branch whose fetch fails renders as "⚠️ couldn't load" in the breakdown, not a thrown error or a silently dropped row.
- Zero resolvable branches for the sender's phone → a plain-text explanation, not a fallthrough to the free-form Gemini path.
- `whatsapp-reports.ts` stays I/O-free; all Supabase-backed fetching happens in `whatsapp-processor.ts`.

---

## Task 1: `matchOrgReportIntent` — trigger phrase matcher

**Files:**
- Modify: `src/lib/services/whatsapp-reports.ts`
- Test: `src/lib/services/whatsapp-reports.test.ts`

**Interfaces:**
- Produces: `export type OrgReportKey = "org-overview" | "org-giving";` and `export function matchOrgReportIntent(text: string): OrgReportKey | null`, both used by Task 2's tests-adjacent work and Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/services/whatsapp-reports.test.ts`, right after the existing `matchReportIntent` import line (update the import line itself to include the new names):

```typescript
import { matchReportIntent, buildReport, matchOrgReportIntent } from "@/lib/services/whatsapp-reports";
```

Then add this new `describe` block anywhere at the top level of the file (e.g. directly after the closing `});` of the existing `describe("matchReportIntent", ...)` block):

```typescript
describe("matchOrgReportIntent", () => {
  it("matches org-overview: all branches", () => {
    expect(matchOrgReportIntent("all branches")).toBe("org-overview");
  });
  it("matches org-overview: across all branches", () => {
    expect(matchOrgReportIntent("across all branches")).toBe("org-overview");
  });
  it("matches org-overview: across branches", () => {
    expect(matchOrgReportIntent("across branches")).toBe("org-overview");
  });
  it("matches org-overview: every branch", () => {
    expect(matchOrgReportIntent("how did we do across every branch")).toBe("org-overview");
  });
  it("matches org-overview: org overview", () => {
    expect(matchOrgReportIntent("org overview")).toBe("org-overview");
  });
  it("matches org-overview: organization overview", () => {
    expect(matchOrgReportIntent("organization overview")).toBe("org-overview");
  });
  it("matches org-giving: giving across all branches", () => {
    expect(matchOrgReportIntent("giving across all branches")).toBe("org-giving");
  });
  it("matches org-giving: total tithes across branches", () => {
    expect(matchOrgReportIntent("total tithes across branches")).toBe("org-giving");
  });
  it("matches org-giving: org giving", () => {
    expect(matchOrgReportIntent("org giving")).toBe("org-giving");
  });
  it("matches org-giving: offerings across all branches", () => {
    expect(matchOrgReportIntent("offerings across all branches")).toBe("org-giving");
  });
  it("returns null for a create verb even with an org phrase", () => {
    expect(matchOrgReportIntent("log an expense across all branches")).toBeNull();
  });
  it("returns null for casual chat", () => {
    expect(matchOrgReportIntent("hello there")).toBeNull();
  });
  it("returns null for single-branch overview phrasing", () => {
    expect(matchOrgReportIntent("business overview")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/whatsapp-reports.test.ts`
Expected: FAIL — `matchOrgReportIntent` is not exported from `whatsapp-reports.ts`.

- [ ] **Step 3: Implement `matchOrgReportIntent`**

In `src/lib/services/whatsapp-reports.ts`, add this directly after the closing `}` of the existing `matchReportIntent` function (i.e. right after line 81, before the `type ReportContext = {` block):

```typescript
export type OrgReportKey = "org-overview" | "org-giving";

export function matchOrgReportIntent(text: string): OrgReportKey | null {
  const t = text.toLowerCase().trim();

  // Never match if the message contains a CREATE verb
  if (CREATE_VERBS.test(t)) return null;

  const mentionsAllBranches =
    /\ball branches\b/i.test(t) ||
    /\bacross (?:all )?branches\b/i.test(t) ||
    /\bevery branch\b/i.test(t) ||
    /\borg(?:anization)? (?:overview|report|summary)\b/i.test(t);

  if (!mentionsAllBranches) return null;

  const mentionsGiving = /\bgiving\b/i.test(t) || /\btithes?\b/i.test(t) || /\bofferings?\b/i.test(t);
  return mentionsGiving ? "org-giving" : "org-overview";
}
```

This reuses the module-level `CREATE_VERBS` constant already defined above `matchReportIntent` — no new import needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/services/whatsapp-reports.test.ts`
Expected: PASS, all tests including the new `matchOrgReportIntent` describe block.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/whatsapp-reports.ts src/lib/services/whatsapp-reports.test.ts
git commit -m "feat: add matchOrgReportIntent trigger matcher for cross-branch reports"
```

---

## Task 2: `buildOrgOverviewReport` and `buildOrgGivingReport` — pure formatters

**Files:**
- Modify: `src/lib/services/whatsapp-reports.ts`
- Test: `src/lib/services/whatsapp-reports.test.ts`

**Interfaces:**
- Consumes: `OrgReportKey` (Task 1, not directly used by these functions but by the caller); `ComputedMetrics` from `@/lib/services/business-metrics`; `GivingSummary` from `@/lib/services/whatsapp-workspace` (already imported in this file as a type).
- Produces:
  ```typescript
  export type OrgBranchOverview = { id: string; name: string; metrics?: ComputedMetrics };
  export type OrgBranchGiving = { id: string; name: string; givingSummary?: GivingSummary };
  export function buildOrgOverviewReport(branches: OrgBranchOverview[]): { text: string; buttons?: Array<{ id: string; title: string }> };
  export function buildOrgGivingReport(branches: OrgBranchGiving[]): { text: string; buttons?: Array<{ id: string; title: string }> };
  ```
  Both consumed by Task 3/4's `whatsapp-processor.ts` wiring.

- [ ] **Step 1: Write the failing tests**

Update the import line in `src/lib/services/whatsapp-reports.test.ts` (from Task 1) to also pull in the new names and a type-only import:

```typescript
import { matchReportIntent, buildReport, matchOrgReportIntent, buildOrgOverviewReport, buildOrgGivingReport } from "@/lib/services/whatsapp-reports";
import type { ComputedMetrics } from "@/lib/services/business-metrics";
import type { GivingSummary } from "@/lib/services/whatsapp-workspace";
```

Add this fixture helper near the top of the file, alongside `guestSession`/`guestCtx`:

```typescript
function fixtureMetrics(overrides: Partial<ComputedMetrics> = {}): ComputedMetrics {
  return {
    totalSales: 100_000,
    salesDeltaPct: 5,
    walletBalance: 50_000,
    cashback: 1_000,
    customers: 10,
    customersDeltaPct: 2,
    spend: 20_000,
    spendDeltaPct: 1,
    pendingApprovals: 2,
    approvedCount: 3,
    openIssues: 1,
    lowStock: 1,
    awaitingSig: 0,
    series: [],
    recentActivity: [],
    ...overrides,
  };
}

function fixtureGiving(overrides: Partial<GivingSummary> = {}): GivingSummary {
  return {
    totalThisMonth: 50_000,
    totalLastMonth: 40_000,
    countThisMonth: 5,
    byType: {},
    recent: [],
    ...overrides,
  };
}

function naira(n: number): string {
  return "₦" + n.toLocaleString("en-NG");
}
```

Add these two new `describe` blocks at the end of the file:

```typescript
describe("buildOrgOverviewReport", () => {
  it("sums totals across branches and lists each by name", () => {
    const { text, buttons } = buildOrgOverviewReport([
      { id: "a", name: "Lagos", metrics: fixtureMetrics({ totalSales: 100_000, walletBalance: 50_000, customers: 10, pendingApprovals: 2, openIssues: 1, lowStock: 1 }) },
      { id: "b", name: "Abuja", metrics: fixtureMetrics({ totalSales: 200_000, walletBalance: 30_000, customers: 5, pendingApprovals: 1, openIssues: 0, lowStock: 2 }) },
    ]);
    expect(text).toContain("All Branches — Overview");
    expect(text).toContain(naira(300_000));
    expect(text).toContain("Lagos");
    expect(text).toContain("Abuja");
    expect(buttons).toEqual([{ id: "rpt:org-giving", title: "Giving (all branches)" }]);
  });

  it("shows a fallback line for a branch whose data failed to load, and excludes it from totals", () => {
    const { text } = buildOrgOverviewReport([
      { id: "a", name: "Lagos", metrics: fixtureMetrics({ totalSales: 100_000 }) },
      { id: "c", name: "Enugu", metrics: undefined },
    ]);
    expect(text).toContain("Enugu: ⚠️ couldn't load");
    expect(text).toContain(naira(100_000));
  });
});

describe("buildOrgGivingReport", () => {
  it("sums giving totals across branches and lists each by name", () => {
    const { text, buttons } = buildOrgGivingReport([
      { id: "a", name: "Lagos", givingSummary: fixtureGiving({ totalThisMonth: 50_000, countThisMonth: 5 }) },
      { id: "b", name: "Abuja", givingSummary: fixtureGiving({ totalThisMonth: 30_000, countThisMonth: 3 }) },
    ]);
    expect(text).toContain("All Branches — Giving");
    expect(text).toContain(naira(80_000));
    expect(text).toContain("8 gifts");
    expect(buttons).toEqual([{ id: "rpt:org-overview", title: "Overview (all branches)" }]);
  });

  it("shows a fallback line for a branch whose data failed to load, and excludes it from totals", () => {
    const { text } = buildOrgGivingReport([
      { id: "a", name: "Lagos", givingSummary: fixtureGiving({ totalThisMonth: 50_000, countThisMonth: 5 }) },
      { id: "c", name: "Enugu", givingSummary: undefined },
    ]);
    expect(text).toContain("Enugu: ⚠️ couldn't load");
    expect(text).toContain(naira(50_000));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/whatsapp-reports.test.ts`
Expected: FAIL — `buildOrgOverviewReport`/`buildOrgGivingReport` are not exported from `whatsapp-reports.ts`.

- [ ] **Step 3: Implement the formatters**

In `src/lib/services/whatsapp-reports.ts`, change the top import line that currently reads:

```typescript
import { computeMetrics, type WorkspaceData } from "@/lib/services/business-metrics";
```

to also bring in the type:

```typescript
import { computeMetrics, type WorkspaceData, type ComputedMetrics } from "@/lib/services/business-metrics";
```

Then add the following at the very end of the file, after the existing `deltaPct` helper function:

```typescript
export type OrgBranchOverview = { id: string; name: string; metrics?: ComputedMetrics };

export function buildOrgOverviewReport(
  branches: OrgBranchOverview[],
): { text: string; buttons?: Array<{ id: string; title: string }> } {
  const loaded = branches.filter((b) => b.metrics);
  const totalSales = loaded.reduce((s, b) => s + (b.metrics?.totalSales ?? 0), 0);
  const totalWallet = loaded.reduce((s, b) => s + (b.metrics?.walletBalance ?? 0), 0);
  const totalCustomers = loaded.reduce((s, b) => s + (b.metrics?.customers ?? 0), 0);
  const totalPending = loaded.reduce((s, b) => s + (b.metrics?.pendingApprovals ?? 0), 0);
  const totalOpenIssues = loaded.reduce((s, b) => s + (b.metrics?.openIssues ?? 0), 0);
  const totalLowStock = loaded.reduce((s, b) => s + (b.metrics?.lowStock ?? 0), 0);

  const branchLines = branches.map((b) =>
    b.metrics ? `• ${b.name}: ${fmt(b.metrics.totalSales)} sales` : `• ${b.name}: ⚠️ couldn't load`,
  );

  return {
    text: [
      "📊 *All Branches — Overview*",
      "",
      `💰 Sales this month (combined): *${fmt(totalSales)}*`,
      `👛 Wallet (combined): ${fmt(totalWallet)} · 👥 Customers (combined): ${totalCustomers}`,
      `🧾 Pending: ${totalPending} · Open issues: ${totalOpenIssues} · Low stock: ${totalLowStock}`,
      "",
      "*By branch*",
      ...branchLines,
    ].join("\n"),
    buttons: [{ id: "rpt:org-giving", title: "Giving (all branches)" }],
  };
}

export type OrgBranchGiving = { id: string; name: string; givingSummary?: GivingSummary };

export function buildOrgGivingReport(
  branches: OrgBranchGiving[],
): { text: string; buttons?: Array<{ id: string; title: string }> } {
  const loaded = branches.filter((b) => b.givingSummary);
  const totalGiving = loaded.reduce((s, b) => s + (b.givingSummary?.totalThisMonth ?? 0), 0);
  const totalCount = loaded.reduce((s, b) => s + (b.givingSummary?.countThisMonth ?? 0), 0);

  const branchLines = branches.map((b) =>
    b.givingSummary
      ? `• ${b.name}: ${fmt(b.givingSummary.totalThisMonth)} (${b.givingSummary.countThisMonth} gift${b.givingSummary.countThisMonth !== 1 ? "s" : ""})`
      : `• ${b.name}: ⚠️ couldn't load`,
  );

  return {
    text: [
      "🙏 *All Branches — Giving*",
      "",
      `• This month (combined): *${fmt(totalGiving)}* from ${totalCount} gift${totalCount !== 1 ? "s" : ""}`,
      "",
      "*By branch*",
      ...branchLines,
    ].join("\n"),
    buttons: [{ id: "rpt:org-overview", title: "Overview (all branches)" }],
  };
}
```

`fmt` and `GivingSummary` are both already available in this file — `fmt` is the module-private helper defined above `buildReport`, and `GivingSummary` is already imported as a type at the top of the file (`import type { GivingSummary, PhoneLink, WorkspaceContext } from "@/lib/services/whatsapp-workspace";`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/services/whatsapp-reports.test.ts`
Expected: PASS, full file including both new describe blocks.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-reports.ts src/lib/services/whatsapp-reports.test.ts
git commit -m "feat: add buildOrgOverviewReport and buildOrgGivingReport formatters"
```

---

## Task 3: Wire org-wide reports into the free-text dispatch path

**Files:**
- Modify: `src/lib/services/whatsapp-processor.ts`
- Test: `src/lib/services/whatsapp-processor.test.ts`

**Interfaces:**
- Consumes: `matchOrgReportIntent`, `OrgReportKey`, `buildOrgOverviewReport`, `buildOrgGivingReport` (Tasks 1–2, from `@/lib/services/whatsapp-reports`); `getOrganizationWorkspaces` (existing, from `@/lib/services/whatsapp-workspace`); `computeMetrics` (existing, from `@/lib/services/business-metrics`); `getGivingSummary`, `loadWorkspaceData` (already imported in this file).
- Produces: a private `buildOrgWideReport(orgReportKey: OrgReportKey, from: string): Promise<{ text: string; buttons?: Array<{ id: string; title: string }> }>` helper, reused by Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/services/whatsapp-processor.test.ts`, inside the existing `describe("processWhatsAppMessage", ...)` block (e.g. right before its closing `});`):

```typescript
  it("answers an org-wide overview query by combining metrics across all the sender's branches", async () => {
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "getOrganizationWorkspaces").mockResolvedValueOnce([
      { id: "branch-a", name: "Grace Chapel — Lagos" },
      { id: "branch-b", name: "Grace Chapel — Abuja" },
    ]);

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "how did we do across all branches" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockButtons).toHaveBeenCalledOnce();
    const [, text, buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(text).toContain("All Branches — Overview");
    expect(text).toContain("Grace Chapel — Lagos");
    expect(text).toContain("Grace Chapel — Abuja");
    expect(buttons).toEqual([{ id: "rpt:org-giving", title: "Giving (all branches)" }]);
  });

  it("tells a phone with no resolvable org branches this feature is for org admins", async () => {
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "getOrganizationWorkspaces").mockResolvedValueOnce([]);

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "giving across all branches" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("organization admins"));
    expect(mockButtons).not.toHaveBeenCalled();
  });
```

`getOrganizationWorkspaces` is already re-exported unmocked (via the `...actual` spread in the existing `vi.mock("@/lib/services/whatsapp-workspace", ...)` block at the top of this file — no change needed there since `vi.spyOn` on the real exported function works the same way `rejectOrganization` is already spied on elsewhere in this file), so no new `vi.mock` block is needed. `loadWorkspaceData` is not mocked in this file either (it falls back to demo data for non-UUID workspace IDs like `"branch-a"`), so the overview test above exercises real demo-data fallback for both branches — that's expected and fine.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: FAIL — `getOrganizationWorkspaces` is not called by `processWhatsAppMessage` yet, so `mockButtons`/`mockSend` assertions fail (the message currently falls through to `runCherttCommand`).

- [ ] **Step 3: Implement the dispatch**

In `src/lib/services/whatsapp-processor.ts`, update the import from `whatsapp-reports` (currently `import { matchReportIntent, buildReport } from "@/lib/services/whatsapp-reports";`) to:

```typescript
import {
  matchReportIntent,
  buildReport,
  matchOrgReportIntent,
  buildOrgOverviewReport,
  buildOrgGivingReport,
  type OrgReportKey,
} from "@/lib/services/whatsapp-reports";
```

Add `getOrganizationWorkspaces` to the existing `whatsapp-workspace` import list (the multi-line import starting `import { lookupAllPhoneLinks, ... } from "@/lib/services/whatsapp-workspace";`) — insert it alongside `getGivingSummary`:

```typescript
  getGivingSummary,
  getOrganizationWorkspaces,
```

Update the `business-metrics` situation: this file does not currently import `computeMetrics` at all — add a new import line near the other service imports (e.g. directly below the `loadWorkspaceData` import):

```typescript
import { computeMetrics } from "@/lib/services/business-metrics";
```

Add this helper function near `buildReport`'s call sites — a reasonable spot is directly above the `handleButtonReply` function (so both Task 3's text-dispatch call site and Task 4's button call site can reach it):

```typescript
async function buildOrgWideReport(
  orgReportKey: OrgReportKey,
  from: string,
): Promise<{ text: string; buttons?: Array<{ id: string; title: string }> }> {
  const branches = await getOrganizationWorkspaces(from).catch(() => []);
  if (!branches.length) {
    return { text: "This is for organization admins overseeing more than one branch." };
  }

  if (orgReportKey === "org-giving") {
    const perBranch = await Promise.all(
      branches.map(async (b) => ({
        id: b.id,
        name: b.name,
        givingSummary: await getGivingSummary(b.id).catch(() => undefined),
      })),
    );
    return buildOrgGivingReport(perBranch);
  }

  const perBranch = await Promise.all(
    branches.map(async (b) => {
      const data = await loadWorkspaceData(b.id).catch(() => undefined);
      return { id: b.id, name: b.name, metrics: data ? computeMetrics(data, "month") : undefined };
    }),
  );
  return buildOrgOverviewReport(perBranch);
}
```

Finally, wire the text-trigger dispatch. Find this existing block (currently starting around line 790):

```typescript
  // ── Report / query intents ──
  if (trimmed) {
    const reportKey = matchReportIntent(trimmed);
```

Insert a new block directly above it:

```typescript
  // ── Org-wide report intents (cross-branch, org admins only) ──
  if (trimmed) {
    const orgReportKey = matchOrgReportIntent(trimmed);
    if (orgReportKey) {
      const { text, buttons } = await buildOrgWideReport(orgReportKey, from);
      if (buttons?.length) {
        try { await sendInteractiveButtons(from, text, buttons); }
        catch { await sendTextMessage(from, text); }
      } else {
        await sendTextMessage(from, text);
      }
      return;
    }
  }

  // ── Report / query intents ──
  if (trimmed) {
    const reportKey = matchReportIntent(trimmed);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: PASS, including the two new tests.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-processor.ts src/lib/services/whatsapp-processor.test.ts
git commit -m "feat: dispatch org-wide overview/giving reports from free-text triggers"
```

---

## Task 4: Wire org-wide reports into the `rpt:` button-navigation handler

**Files:**
- Modify: `src/lib/services/whatsapp-processor.ts`
- Test: `src/lib/services/whatsapp-processor.test.ts`

**Interfaces:**
- Consumes: `buildOrgWideReport` (Task 3, same file); `OrgReportKey` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/services/whatsapp-processor.test.ts`, alongside the two tests added in Task 3:

```typescript
  it("flips from the org overview report to the org giving report via the button", async () => {
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "getOrganizationWorkspaces").mockResolvedValueOnce([
      { id: "branch-a", name: "Grace Chapel — Lagos" },
    ]);

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "rpt:org-giving" });

    expect(mockButtons).toHaveBeenCalledOnce();
    const [, text] = mockButtons.mock.calls[0] as [string, string];
    expect(text).toContain("All Branches — Giving");
    expect(text).toContain("Grace Chapel — Lagos");
  });
```

Per `IncomingMessage` (`whatsapp-processor.ts`), a button tap arrives as `type: "interactive"` with `buttonReplyId` set — not a `buttonId` field or a `type: "button"` variant.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: FAIL — `rpt:org-giving` isn't handled by `handleButtonReply` yet, so it falls through to the generic `rpt:` handler (which will crash or misbehave on an unrecognized key) or elsewhere.

- [ ] **Step 3: Implement the button wiring**

In `src/lib/services/whatsapp-processor.ts`, find the existing button-navigation block inside `handleButtonReply`:

```typescript
  // ── Report navigation buttons ──
  if (buttonId.startsWith("rpt:")) {
```

Insert a new block directly above it:

```typescript
  // ── Org-wide report navigation buttons ──
  if (buttonId === "rpt:org-overview" || buttonId === "rpt:org-giving") {
    const orgReportKey = buttonId.slice(4) as OrgReportKey;
    const { text, buttons } = await buildOrgWideReport(orgReportKey, from);
    if (buttons?.length) {
      try { await sendInteractiveButtons(from, text, buttons); }
      catch { await sendTextMessage(from, text); }
    } else {
      await sendTextMessage(from, text);
    }
    return;
  }

  // ── Report navigation buttons ──
  if (buttonId.startsWith("rpt:")) {
```

Note `handleButtonReply(from, buttonId, session, link)` already has `from` in scope, so `buildOrgWideReport(orgReportKey, from)` needs no new parameter threading.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: PASS, including the new button-flip test.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-processor.ts src/lib/services/whatsapp-processor.test.ts
git commit -m "feat: wire org-wide report buttons into rpt: navigation handler"
```

---

## Self-Review Notes

**Spec coverage:** Trigger phrases + access gate → Task 1 (matcher) + Task 3 (gate via `buildOrgWideReport`'s empty-branches check). Output format (combined totals, per-branch breakdown, no delta-%, fallback line for failed branches) → Task 2. Data flow / call-site changes (both import additions and both dispatch points) → Tasks 3–4. Error handling (per-branch catch, `getOrganizationWorkspaces` catch) → Task 3's `buildOrgWideReport`. Testing → each task carries its own. Explicitly-out-of-scope items are simply not touched by any task, matching the spec.

**Placeholder scan:** none found — all code blocks are complete, and the `IncomingMessage` button-tap shape (`type: "interactive"`, `buttonReplyId`) was verified against the actual type definition rather than guessed.

**Type consistency:** `OrgReportKey` (Task 1) is used identically in Task 3 (`buildOrgWideReport` parameter) and Task 4 (`buttonId.slice(4) as OrgReportKey`). `OrgBranchOverview`/`OrgBranchGiving` (Task 2) match the object shapes constructed in Task 3's `buildOrgWideReport`. Button IDs `rpt:org-overview`/`rpt:org-giving` are consistent across Task 2 (emitted in each formatter's `buttons` array), Task 3 (n/a — not emitted there, only consumed downstream), and Task 4 (matched exactly in the button handler).
