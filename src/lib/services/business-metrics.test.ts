import { describe, it, expect } from "vitest";
import { computeMetrics, type WorkspaceData } from "@/lib/services/business-metrics";
import { getDemoWorkspaceData } from "@/lib/data/demo-workspace";

const demoData = getDemoWorkspaceData();

describe("computeMetrics", () => {
  it("returns deterministic metrics for demo data (month period)", () => {
    const m = computeMetrics(demoData, "month", new Date("2026-06-06"));
    expect(m.totalSales).toBeGreaterThan(0);
    expect(m.walletBalance).toBeGreaterThan(0);
    expect(m.customers).toBeGreaterThan(0);
    expect(m.pendingApprovals).toBeGreaterThanOrEqual(0);
    expect(m.openIssues).toBeGreaterThanOrEqual(0);
    expect(m.lowStock).toBeGreaterThanOrEqual(0);
    expect(m.awaitingSig).toBeGreaterThanOrEqual(0);
    expect(m.series).toBeInstanceOf(Array);
    expect(m.series.length).toBeGreaterThan(0);
    expect(m.recentActivity).toBeInstanceOf(Array);
  });

  it("year period returns 12 monthly series points", () => {
    const m = computeMetrics(demoData, "year", new Date("2026-06-06"));
    expect(m.series).toHaveLength(12);
  });

  it("week period returns 7 daily series points", () => {
    const m = computeMetrics(demoData, "week", new Date("2026-06-06"));
    expect(m.series).toHaveLength(7);
  });

  it("today period returns 6 series points", () => {
    const m = computeMetrics(demoData, "today", new Date("2026-06-06"));
    expect(m.series).toHaveLength(6);
  });

  it("sales delta is zero when no previous period data", () => {
    const empty: WorkspaceData = {
      requests: [], expenses: [], issues: [], inventory: [], documents: [],
      orders: [], customers: [], walletTransactions: [],
    };
    const m = computeMetrics(empty, "month");
    expect(m.totalSales).toBe(0);
    expect(m.salesDeltaPct).toBe(0);
  });

  it("wallet balance = credits - debits", () => {
    const withWallet: WorkspaceData = {
      requests: [], expenses: [], issues: [], inventory: [], documents: [],
      orders: [], customers: [],
      walletTransactions: [
        { id: "1", amount: 1000, type: "credit", label: "Deposit", createdAt: "2026-06-01" },
        { id: "2", amount: 300, type: "debit", label: "Withdrawal", createdAt: "2026-06-02" },
      ],
    };
    const m = computeMetrics(withWallet, "month");
    expect(m.walletBalance).toBe(700);
  });

  it("pending approvals count is correct", () => {
    const m = computeMetrics(demoData, "month");
    const pending = demoData.requests.filter((r) => r.status === "pending").length;
    expect(m.pendingApprovals).toBe(pending);
  });

  it("low stock count matches inventory with inStock <= minLevel", () => {
    const m = computeMetrics(demoData, "month");
    const low = demoData.inventory.filter((i) => i.inStock <= i.minLevel).length;
    expect(m.lowStock).toBe(low);
  });
});
