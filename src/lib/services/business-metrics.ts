/**
 * Shared business metrics — single formula used by BOTH the web dashboard
 * and WhatsApp reports so both surfaces show identical numbers.
 *
 * Deterministic, pure, unit-testable. No side effects, no Supabase calls.
 */
import type {
  ExpenseEntry,
  InventoryItem,
  IssueReport,
  SmartDocument,
  WorkflowRequest,
} from "@/lib/types";

export type Customer = { id: string; name: string; totalSpent: number; orderCount: number };
export type WalletTxn = { id: string; amount: number; type: "credit" | "debit"; label: string; createdAt: string };
export type SalesOrder = { id: string; total: number; customerId: string; createdAt: string };

export type WorkspaceData = {
  requests: WorkflowRequest[];
  expenses: ExpenseEntry[];
  issues: IssueReport[];
  inventory: InventoryItem[];
  documents: SmartDocument[];
  orders: SalesOrder[];
  customers: Customer[];
  walletTransactions: WalletTxn[];
};

export type Period = "today" | "week" | "month" | "year";

export type ComputedMetrics = {
  totalSales: number;
  salesDeltaPct: number;
  walletBalance: number;
  cashback: number;
  customers: number;
  customersDeltaPct: number;
  spend: number;
  spendDeltaPct: number;
  pendingApprovals: number;
  approvedCount: number;
  openIssues: number;
  lowStock: number;
  awaitingSig: number;
  series: { label: string; value: number }[];
  recentActivity: { id: string; title: string; detail: string; timeLabel: string }[];
};

function periodStart(now: Date, period: Period): Date {
  const d = new Date(now);
  switch (period) {
    case "today":
      d.setHours(0, 0, 0, 0);
      return d;
    case "week":
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    case "year":
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
  }
}

function prevPeriodStart(now: Date, period: Period): Date {
  const d = periodStart(now, period);
  switch (period) {
    case "today":
      d.setDate(d.getDate() - 1);
      return d;
    case "week":
      d.setDate(d.getDate() - 7);
      return d;
    case "month":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      return d;
  }
}

function inPeriod(dateStr: string | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d < end;
}

function deltaPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function computeMetrics(data: WorkspaceData, period: Period, now = new Date()): ComputedMetrics {
  const start = periodStart(now, period);
  const end = new Date(now);
  const prevStart = prevPeriodStart(now, period);
  const prevEnd = start;

  // Sales = sum of order totals in period
  const periodOrders = data.orders.filter((o) => inPeriod(o.createdAt, start, end));
  const prevOrders = data.orders.filter((o) => inPeriod(o.createdAt, prevStart, prevEnd));
  const totalSales = periodOrders.reduce((s, o) => s + o.total, 0);
  const prevSales = prevOrders.reduce((s, o) => s + o.total, 0);

  // Customers = distinct customer IDs in orders this period
  const periodCustomerIds = new Set(periodOrders.map((o) => o.customerId));
  const prevCustomerIds = new Set(prevOrders.map((o) => o.customerId));
  const customers = periodCustomerIds.size || data.customers.length;
  const prevCustomers = prevCustomerIds.size || data.customers.length;

  // Spend = sum of expenses in period
  const periodExpenses = data.expenses.filter((e) => {
    return true; // ExpenseEntry has no date field, include all
  });
  const prevExpenses = data.expenses.filter((e) => {
    return false;
  });
  const spend = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const prevSpend = prevExpenses.reduce((s, e) => s + e.amount, 0);

  // Wallet
  const credits = data.walletTransactions.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
  const debits = data.walletTransactions.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
  const walletBalance = credits - debits;
  const cashback = data.walletTransactions
    .filter((t) => t.label.toLowerCase().includes("cashback"))
    .reduce((s, t) => s + t.amount, 0);

  // Operational
  const pendingApprovals = data.requests.filter((r) => r.status === "pending").length;
  const approvedCount = data.requests.filter((r) => r.status === "approved" || r.status === "completed").length;
  const openIssues = data.issues.filter((i) => i.status !== "completed" && i.status !== "approved").length;
  const lowStock = data.inventory.filter((i) => i.inStock <= i.minLevel).length;
  const awaitingSig = data.documents.filter((d) => d.awaitingSignatureFrom).length;

  // Trend series
  const series = buildTrendSeries(data, period, now);

  // Recent activity
  const recent: ComputedMetrics["recentActivity"] = [];
  for (const r of data.requests.slice(0, 3)) {
    recent.push({ id: r.id, title: r.title, detail: `${r.type} · ${r.status}`, timeLabel: r.createdAtLabel || "" });
  }
  for (const e of data.expenses.slice(0, 2)) {
    recent.push({ id: e.id, title: e.title, detail: `${e.department} · ₦${e.amount.toLocaleString()}`, timeLabel: "" });
  }

  return {
    totalSales,
    salesDeltaPct: deltaPct(totalSales, prevSales),
    walletBalance,
    cashback,
    customers,
    customersDeltaPct: deltaPct(customers, prevCustomers),
    spend,
    spendDeltaPct: deltaPct(spend, prevSpend),
    pendingApprovals,
    approvedCount,
    openIssues,
    lowStock,
    awaitingSig,
    series,
    recentActivity: recent.slice(0, 5),
  };
}

function buildTrendSeries(data: WorkspaceData, period: Period, now: Date): { label: string; value: number }[] {
  const labels = periodLabels(period, now);
  const buckets = new Map<string, number>();
  labels.forEach((l) => buckets.set(l.label, 0));

  for (const o of data.orders) {
    const key = bucketKey(new Date(o.createdAt), period, now);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + o.total);
  }

  return labels.map((l) => ({ label: l.label, value: buckets.get(l.label) ?? 0 }));
}

function periodLabels(period: Period, now: Date): { label: string }[] {
  switch (period) {
    case "year":
      return [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ].map((l) => ({ label: l }));
    case "month":
      return [
        { label: "Wk 1" }, { label: "Wk 2" }, { label: "Wk 3" }, { label: "Wk 4" },
      ];
    case "week":
      return [
        { label: "Mon" }, { label: "Tue" }, { label: "Wed" },
        { label: "Thu" }, { label: "Fri" }, { label: "Sat" }, { label: "Sun" },
      ];
    case "today":
      return [
        { label: "8am" }, { label: "10am" }, { label: "12pm" },
        { label: "2pm" }, { label: "4pm" }, { label: "6pm" },
      ];
  }
}

function bucketKey(date: Date, period: Period, now: Date): string {
  switch (period) {
    case "year":
      return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()] ?? "Jan";
    case "month": {
      const week = Math.ceil(date.getDate() / 7);
      return `Wk ${Math.min(week, 4)}`;
    }
    case "week": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return days[date.getDay()] ?? "Mon";
    }
    case "today": {
      const h = date.getHours();
      if (h < 9) return "8am";
      if (h < 11) return "10am";
      if (h < 13) return "12pm";
      if (h < 15) return "2pm";
      if (h < 17) return "4pm";
      return "6pm";
    }
  }
}
