import { describe, it, expect, beforeEach } from "vitest";
import { matchReportIntent, buildReport, matchOrgReportIntent, buildOrgOverviewReport, buildOrgGivingReport } from "@/lib/services/whatsapp-reports";
import type { GivingSummary } from "@/lib/services/whatsapp-workspace";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";

function guestSession(): WhatsAppSession {
  return {
    phoneNumber: "+2348000000000",
    welcomed: true,
    demoBalance: 500_000,
    history: [],
  };
}

function guestCtx() {
  return {
    link: null,
    session: guestSession(),
    workspaceContext: undefined,
  };
}

function fixtureGiving(overrides: Partial<GivingSummary> = {}): GivingSummary {
  return {
    totalThisMonth: 50_000,
    totalLastMonth: 40_000,
    countThisMonth: 5,
    byType: {},
    byTypeCount: {},
    uniqueGivers: 4,
    avgGift: 10_000,
    biggest: null,
    thisWeekTotal: 0,
    thisWeekCount: 0,
    topGivers: [],
    recent: [],
    ...overrides,
  };
}

function naira(n: number): string {
  return "₦" + n.toLocaleString("en-NG");
}

describe("matchReportIntent", () => {
  // ── Overview (church "at a glance") ──
  it("matches overview: how is the church doing", () => {
    expect(matchReportIntent("how is the church doing")).toBe("overview");
  });
  it("matches overview: church overview", () => {
    expect(matchReportIntent("church overview")).toBe("overview");
  });
  it("matches overview: at a glance", () => {
    expect(matchReportIntent("at a glance")).toBe("overview");
  });
  it("matches overview: dashboard", () => {
    expect(matchReportIntent("dashboard")).toBe("overview");
  });

  // ── Requests / approvals ──
  it("matches requests: my requests", () => {
    expect(matchReportIntent("my requests")).toBe("requests");
  });
  it("matches requests: what's pending", () => {
    expect(matchReportIntent("what's pending")).toBe("requests");
  });
  it("matches requests: pending approvals", () => {
    expect(matchReportIntent("pending approvals")).toBe("requests");
  });
  it("matches requests: what needs my approval", () => {
    expect(matchReportIntent("what needs my approval")).toBe("requests");
  });

  // ── Issues ──
  it("matches issues: open issues", () => {
    expect(matchReportIntent("open issues")).toBe("issues");
  });
  it("matches issues: issues report", () => {
    expect(matchReportIntent("issues report")).toBe("issues");
  });
  it("matches issues: facility issues", () => {
    expect(matchReportIntent("facility issues")).toBe("issues");
  });

  // ── Business reports are NOT part of the church surface anymore ──
  it("does not route customers/sales/wallet/inventory/expenses", () => {
    expect(matchReportIntent("how many customers")).toBeNull();
    expect(matchReportIntent("sales report")).toBeNull();
    expect(matchReportIntent("total sales")).toBeNull();
    expect(matchReportIntent("revenue")).toBeNull();
    expect(matchReportIntent("wallet balance")).toBeNull();
    expect(matchReportIntent("my balance")).toBeNull();
    expect(matchReportIntent("stock levels")).toBeNull();
    expect(matchReportIntent("low stock")).toBeNull();
    expect(matchReportIntent("show expenses")).toBeNull();
    expect(matchReportIntent("how's my business")).toBeNull();
  });

  // ── Should NOT match create messages ──
  it("returns null for log expense", () => {
    expect(matchReportIntent("log 5000 transport")).toBeNull();
  });
  it("returns null for raise a request", () => {
    expect(matchReportIntent("raise a request for diesel")).toBeNull();
  });
  it("returns null for draft a letter", () => {
    expect(matchReportIntent("draft a letter to the landlord")).toBeNull();
  });
  it("returns null for create invoice", () => {
    expect(matchReportIntent("create invoice for greenfield")).toBeNull();
  });
  it("returns null for new document", () => {
    expect(matchReportIntent("new document")).toBeNull();
  });
  it("returns null for add item", () => {
    expect(matchReportIntent("add printer paper to inventory")).toBeNull();
  });
  it('returns null for "report broken AC" (create verb)', () => {
    expect(matchReportIntent("report broken AC in reception")).toBeNull();
  });
  it('returns null for "report a facility issue"', () => {
    expect(matchReportIntent("report a facility issue")).toBeNull();
  });
  it("returns null for casual chat", () => {
    expect(matchReportIntent("hello there")).toBeNull();
  });
});

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
  it("returns null for a message that merely mentions 'organization' without a report word", () => {
    expect(matchOrgReportIntent("please update my organization details")).toBeNull();
  });
});

describe("buildReport", () => {
  it("overview is a CHURCH snapshot — attendance, giving, approvals — not a business dashboard", async () => {
    const link = { phoneNumber: "2348000000000", userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace Chapel", userName: "Idris", userRole: "senior_pastor" };
    const { text, buttons } = await buildReport("overview", {
      link,
      session: guestSession(),
      workspaceContext: { pendingRequests: [{ id: "r1", title: "Diesel", amount: 45000, requester: "Sam" }], recentExpenses: [], lowInventoryItems: [], pendingIssues: [{ title: "AC", severity: "medium" }], givingCategories: [], ministryUnits: [] },
      givingSummary: fixtureGiving({ totalThisMonth: 198_000, countThisMonth: 14, thisWeekTotal: 45_000 }),
      serviceSnapshot: { dateLabel: "2026-07-19", adults: 142, children: 34, firstTimers: 5 },
      overviewExtras: { members: 13, newMembersThisMonth: 2, nextEvent: { title: "Youth Night", dateLabel: "2026-07-25" }, firstTimersToFollowUp: 3, attendanceTrend: [156, 128, 142, 176] },
    });
    expect(text).toContain("Grace Chapel — at a glance");
    expect(text).toContain("176 — 142 adults, 34 children");
    expect(text).toContain("5 first-timer");
    expect(text).toContain("156 → 128 → 142 → 176"); // attendance trend
    expect(text).toContain(naira(198_000));
    expect(text).toContain("45,000 this week");
    expect(text).toContain("Members:* 13 (2 new this month)");
    expect(text).toContain("Coming up:* Youth Night");
    expect(text).toContain("1 approval to review");
    expect(text).toContain("1 open issue");
    expect(text).toContain("3 first-timers to follow up");
    // the toolkit voice must be gone
    expect(text).not.toContain("Business Overview");
    expect(text).not.toMatch(/Sales|Wallet|Cashback|Customers|Low stock/);
    expect(buttons).toEqual([{ id: "rpt:giving", title: "Giving this month" }, { id: "main_menu", title: "☰ Menu" }]);
  });

  it("overview degrades gracefully with no service or giving yet", async () => {
    const { text } = await buildReport("overview", guestCtx());
    expect(text).toContain("at a glance");
    expect(text).not.toContain("Business Overview");
    expect(text).toContain("All clear");
  });

  it("giving report shows givers, average, biggest, this-week, by-type counts and top givers", async () => {
    const link = { phoneNumber: "2348000000000", userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace Chapel", userName: "Idris", userRole: "senior_pastor" };
    const { text, buttons } = await buildReport("giving", {
      link,
      session: guestSession(),
      givingSummary: fixtureGiving({
        totalThisMonth: 223_000,
        totalLastMonth: 63_000,
        countThisMonth: 15,
        uniqueGivers: 11,
        avgGift: 14_900,
        biggest: { donor: "Blessing", amount: 50_000 },
        thisWeekTotal: 45_000,
        thisWeekCount: 3,
        byType: { tithe: 115_000, offering: 26_500 },
        byTypeCount: { tithe: 5, offering: 3 },
        topGivers: [{ donor: "Blessing", amount: 50_000 }, { donor: "Pamilerin", amount: 25_000 }],
      }),
    });
    expect(text).toContain("Giving — Grace Chapel");
    expect(text).toContain("11 givers");
    expect(text).toContain(naira(14_900)); // avg
    expect(text).toContain("Biggest ₦50,000 (Blessing)");
    expect(text).toContain("This week ₦45,000");
    expect(text).toContain("Tithe: ₦115,000 (5)");
    expect(text).toContain("*Top givers*");
    expect(text).toContain("1. Blessing — ₦50,000");
    expect(buttons).toEqual([{ id: "rpt:overview", title: "Overview" }, { id: "main_menu", title: "☰ Menu" }]);
  });

  it("customers contains customer overview and recent list", async () => {
    const { text } = await buildReport("customers", guestCtx());
    expect(text).toContain("Customer Overview");
    expect(text).toContain("Total customers");
    expect(text).toContain("Recent customers");
  });

  it("sales contains sales report and top products", async () => {
    const { text } = await buildReport("sales", guestCtx());
    expect(text).toContain("Sales Report");
    expect(text).toContain("Top products");
  });

  it("expenses contains expense report with amounts", async () => {
    const { text } = await buildReport("expenses", guestCtx());
    expect(text).toContain("Expense Report");
    expect(text).toMatch(/₦[\d,]+/);
  });

  it("requests contains pending approvals count", async () => {
    const { text } = await buildReport("requests", guestCtx());
    expect(text).toContain("Requests");
    expect(text).toMatch(/Pending/);
  });

  it("inventory contains stock levels", async () => {
    const { text } = await buildReport("inventory", guestCtx());
    expect(text).toContain("Inventory");
  });

  it("wallet contains balance", async () => {
    const { text } = await buildReport("wallet", guestCtx());
    expect(text).toContain("Wallet");
    expect(text).toMatch(/₦[\d,]+/);
  });

  it("issues contains open issues", async () => {
    const { text } = await buildReport("issues", guestCtx());
    expect(text).toContain("Issues");
  });
});

describe("buildOrgOverviewReport", () => {
  it("combines giving + attendance across branches — church, not business", () => {
    const { text, buttons } = buildOrgOverviewReport([
      { id: "a", name: "Lagos", giving: fixtureGiving({ totalThisMonth: 100_000, countThisMonth: 8 }), snapshot: { dateLabel: "2026-07-19", adults: 120, children: 30, firstTimers: 4 }, pending: 2, issues: 1 },
      { id: "b", name: "Abuja", giving: fixtureGiving({ totalThisMonth: 200_000, countThisMonth: 12 }), snapshot: { dateLabel: "2026-07-19", adults: 80, children: 20, firstTimers: 2 }, pending: 1, issues: 0 },
    ]);
    expect(text).toContain("All Branches — at a glance");
    expect(text).toContain(naira(300_000)); // combined giving
    expect(text).toContain("250"); // combined attendance 150 + 100
    expect(text).toContain("Pending approvals: 3");
    expect(text).toContain("Lagos");
    expect(text).toContain("Abuja");
    expect(text).not.toMatch(/Sales|Wallet|Customers|Low stock/);
    expect(buttons).toEqual([{ id: "rpt:org-giving", title: "Giving (all branches)" }]);
  });

  it("shows a fallback line for a branch whose data failed to load", () => {
    const { text } = buildOrgOverviewReport([
      { id: "a", name: "Lagos", giving: fixtureGiving({ totalThisMonth: 100_000 }), snapshot: null, pending: 0, issues: 0 },
      { id: "c", name: "Enugu", giving: undefined, snapshot: undefined },
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
