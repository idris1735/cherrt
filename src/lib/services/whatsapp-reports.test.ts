import { describe, it, expect, beforeEach } from "vitest";
import { matchReportIntent, buildReport } from "@/lib/services/whatsapp-reports";
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

describe("matchReportIntent", () => {
  // ── Overview ──
  it("matches overview: how's my business", () => {
    expect(matchReportIntent("how's my business")).toBe("overview");
  });
  it("matches overview: business summary", () => {
    expect(matchReportIntent("business summary")).toBe("overview");
  });
  it("matches overview: how are we doing", () => {
    expect(matchReportIntent("how are we doing")).toBe("overview");
  });
  it("matches overview: dashboard", () => {
    expect(matchReportIntent("dashboard")).toBe("overview");
  });

  // ── Customers ──
  it("matches customers: how many customers", () => {
    expect(matchReportIntent("how many customers")).toBe("customers");
  });
  it("matches customers: customer report", () => {
    expect(matchReportIntent("customer report")).toBe("customers");
  });
  it("matches customers: my customers", () => {
    expect(matchReportIntent("my customers")).toBe("customers");
  });

  // ── Sales ──
  it("matches sales: sales report", () => {
    expect(matchReportIntent("sales report")).toBe("sales");
  });
  it("matches sales: total sales", () => {
    expect(matchReportIntent("total sales")).toBe("sales");
  });
  it("matches sales: how much did we sell", () => {
    expect(matchReportIntent("how much did we sell")).toBe("sales");
  });
  it("matches sales: revenue", () => {
    expect(matchReportIntent("revenue")).toBe("sales");
  });
  it("matches sales: sales this month", () => {
    expect(matchReportIntent("sales this month")).toBe("sales");
  });

  // ── Expenses ──
  it("matches expenses: expense report", () => {
    expect(matchReportIntent("expense report")).toBe("expenses");
  });
  it("matches expenses: how much did we spend", () => {
    expect(matchReportIntent("how much did we spend")).toBe("expenses");
  });
  it("matches expenses: show expenses", () => {
    expect(matchReportIntent("show expenses")).toBe("expenses");
  });
  it("matches expenses: spending", () => {
    expect(matchReportIntent("spending")).toBe("expenses");
  });

  // ── Requests ──
  it("matches requests: my requests", () => {
    expect(matchReportIntent("my requests")).toBe("requests");
  });
  it("matches requests: what's pending", () => {
    expect(matchReportIntent("what's pending")).toBe("requests");
  });
  it("matches requests: pending approvals", () => {
    expect(matchReportIntent("pending approvals")).toBe("requests");
  });
  it("matches requests: requests report", () => {
    expect(matchReportIntent("requests report")).toBe("requests");
  });

  // ── Inventory ──
  it("matches inventory: inventory report", () => {
    expect(matchReportIntent("inventory report")).toBe("inventory");
  });
  it("matches inventory: stock levels", () => {
    expect(matchReportIntent("stock levels")).toBe("inventory");
  });
  it("matches inventory: what's low", () => {
    expect(matchReportIntent("what's low")).toBe("inventory");
  });
  it("matches inventory: low stock", () => {
    expect(matchReportIntent("low stock")).toBe("inventory");
  });

  // ── Wallet ──
  it("matches wallet: wallet balance", () => {
    expect(matchReportIntent("wallet balance")).toBe("wallet");
  });
  it("matches wallet: my balance", () => {
    expect(matchReportIntent("my balance")).toBe("wallet");
  });
  it("matches wallet: how much do I have", () => {
    expect(matchReportIntent("how much do I have")).toBe("wallet");
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

describe("buildReport", () => {
  it('overview contains "Business Overview" and a ₦ figure', async () => {
    const { text, buttons } = await buildReport("overview", guestCtx());
    expect(text).toContain("Business Overview");
    expect(text).toMatch(/₦[\d,]+/);
    expect(buttons).toBeDefined();
    expect(buttons!.length).toBeGreaterThan(0);
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
