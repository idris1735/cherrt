import { whatsappDemoData } from "@/lib/data/whatsapp-demo-data";
import { getDemoWorkspaceData } from "@/lib/data/demo-workspace";
import { computeMetrics, type WorkspaceData, type ComputedMetrics } from "@/lib/services/business-metrics";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { GivingSummary, PhoneLink, WorkspaceContext } from "@/lib/services/whatsapp-workspace";

export type ReportKey =
  | "overview"
  | "customers"
  | "sales"
  | "expenses"
  | "requests"
  | "inventory"
  | "wallet"
  | "issues"
  | "giving";

const CREATE_VERBS = /\b(log|add|raise|draft|create|new|report a\b|report an\b|report the\b|record(?:ing)?|make)\b/i;

export function matchReportIntent(text: string): ReportKey | null {
  const t = text.toLowerCase().trim();

  // Never match if the message contains a CREATE verb
  if (CREATE_VERBS.test(t)) return null;

  // Overview
  if (/\bhow(?:'s| is) my business\b/i.test(t)) return "overview";
  if (/\bbusiness (?:summary|overview)\b/i.test(t)) return "overview";
  if (/\bhow (?:are we|we are) doing\b/i.test(t)) return "overview";
  if (/^dashboard$/i.test(t)) return "overview";

  // Customers
  if (/\bhow many customers?\b/i.test(t)) return "customers";
  if (/\bcustomer (?:overview|report|summary)\b/i.test(t)) return "customers";
  if (/\bmy customers\b/i.test(t)) return "customers";

  // Sales
  if (/^sales$/i.test(t) || /\bsales (?:report|overview|summary)\b/i.test(t)) return "sales";
  if (/\btotal sales\b/i.test(t)) return "sales";
  if (/\bhow much (?:did|have) (?:we|you) sell?\b/i.test(t)) return "sales";
  if (/\brevenue\b/i.test(t)) return "sales";
  if (/\bsales this (?:month|week)\b/i.test(t)) return "sales";

  // Expenses
  if (/^expenses?$/i.test(t) || /\bexpense (?:report|overview|summary)\b/i.test(t)) return "expenses";
  if (/\bhow much (?:did|have) (?:we|you) spend?\b/i.test(t)) return "expenses";
  if (/\bshow expenses\b/i.test(t)) return "expenses";
  if (/\bspending\b/i.test(t)) return "expenses";

  // Requests
  if (/^requests?$/i.test(t) || /\brequests? (?:report|overview)\b/i.test(t)) return "requests";
  if (/\bmy requests\b/i.test(t)) return "requests";
  if (/\bwhat(?:'s| is) pending\b/i.test(t)) return "requests";
  if (/\bpending approvals?\b/i.test(t)) return "requests";

  // Inventory
  if (/^inventory$/i.test(t) || /\binventory (?:report|overview|summary)\b/i.test(t)) return "inventory";
  if (/\bstock levels?\b/i.test(t)) return "inventory";
  if (/\bwhat(?:'s| is) low\b/i.test(t)) return "inventory";
  if (/\blow stock\b/i.test(t)) return "inventory";

  // Wallet
  if (/\bwallet balance\b/i.test(t)) return "wallet";
  if (/\bmy balance\b/i.test(t)) return "wallet";
  if (/\bhow much (?:do|have) I (?:have|got)\b/i.test(t)) return "wallet";

  // Issues
  if (/^issues?$/i.test(t) || /\bissues? (?:report|overview)\b/i.test(t)) return "issues";
  if (/\bopen issues\b/i.test(t)) return "issues";
  if (/\bfacility issues?\b/i.test(t)) return "issues";

  // Giving — note: "raise" is deliberately not matched here, it's in CREATE_VERBS
  // above (for "raise a request") and would never reach this point.
  if (/^giving$/i.test(t) || /\bgiving (?:report|overview|summary|history)\b/i.test(t)) return "giving";
  if (/\bhow much (?:did|have) (?:we|you) (?:receive|get|collect)\b/i.test(t)) return "giving";
  if (/\btotal (?:giving|tithes?|offerings?)\b/i.test(t)) return "giving";
  if (/\btithes? and offerings?\b/i.test(t)) return "giving";
  if (/\bgiving this (?:month|week|year)\b/i.test(t)) return "giving";

  return null;
}

export type OrgReportKey = "org-overview" | "org-giving";

export function matchOrgReportIntent(text: string): OrgReportKey | null {
  const t = text.toLowerCase().trim();

  // Never match if the message contains a CREATE verb
  if (CREATE_VERBS.test(t)) return null;

  const mentionsAllBranches =
    /\ball branches\b/i.test(t) ||
    /\bacross (?:all )?branches\b/i.test(t) ||
    /\bevery branch\b/i.test(t) ||
    /\borg(?:anization)? (?:overview|report|summary|giving)\b/i.test(t);

  if (!mentionsAllBranches) return null;

  const mentionsGiving = /\bgiving\b/i.test(t) || /\btithes?\b/i.test(t) || /\bofferings?\b/i.test(t);
  return mentionsGiving ? "org-giving" : "org-overview";
}

type ReportContext = {
  link: PhoneLink | null;
  session: WhatsAppSession;
  workspaceContext?: WorkspaceContext;
  liveData?: WorkspaceData;
  givingSummary?: GivingSummary;
};

function fmt(n: number): string {
  return "₦" + n.toLocaleString("en-NG");
}

function deltaEmoji(pct: number): string {
  return pct >= 0 ? "▲" : "▼";
}

function severityEmoji(s: string): string {
  return s === "high" ? "🔴" : s === "medium" ? "🟡" : "🟢";
}

export async function buildReport(
  key: ReportKey,
  ctx: ReportContext,
): Promise<{ text: string; buttons?: Array<{ id: string; title: string }> }> {
  const isGuest = !ctx.link;
  const d = whatsappDemoData;
  const w = ctx.workspaceContext;

  switch (key) {
    case "overview": {
      // Use shared metrics when live data is available (workspace mode)
      const liveMetrics = ctx.liveData ? computeMetrics(ctx.liveData, "month") : null;
      const bizName = isGuest ? d.businessName : ctx.link?.workspaceName ?? "Your workspace";

      const salesMonth = liveMetrics?.totalSales ?? d.sales.thisMonth;
      const salesDelta = liveMetrics?.salesDeltaPct ?? d.sales.deltaPct;
      const salesToday = liveMetrics ? 0 : d.sales.today; // live data doesn't track "today" as a stat
      const wallet = isGuest ? ctx.session.demoBalance : (liveMetrics?.walletBalance ?? d.walletBalance);
      const custCount = liveMetrics?.customers ?? d.customers.total;
      const pending = liveMetrics?.pendingApprovals ?? (isGuest ? d.requests.filter((r) => r.status === "pending").length : (w?.pendingRequests?.length ?? 0));
      const openIss = liveMetrics?.openIssues ?? (isGuest ? d.issues.filter((i) => i.status !== "completed").length : (w?.pendingIssues?.length ?? 0));
      const lowStk = liveMetrics?.lowStock ?? (isGuest ? d.inventory.filter((i) => i.inStock <= i.minLevel).length : (w?.lowInventoryItems?.length ?? 0));

      return {
        text: [
          `📊 *${bizName} — Business Overview*`,
          "",
          "💰 *Sales*",
          liveMetrics
            ? `• This month: *${fmt(salesMonth)}* (${deltaEmoji(salesDelta)} ${Math.abs(salesDelta)}%)`
            : `• This month: *${fmt(salesMonth)}* (${deltaEmoji(salesDelta)} ${Math.abs(salesDelta)}%)`,
          salesToday > 0 ? `• Today: ${fmt(salesToday)}` : null,
          "",
          `👛 *Wallet*: ${fmt(wallet)}  (Cashback ${fmt(liveMetrics?.cashback ?? d.cashback)})`,
          `👥 *Customers*: ${custCount}`,
          "",
          "🧾 *Operations*",
          `• Pending approvals: ${pending}`,
          `• Open issues: ${openIss}`,
          `• Low stock items: ${lowStk}`,
          "",
          "_Tap below for details._",
        ].filter(Boolean).join("\n"),
        buttons: [
          { id: "rpt:expenses", title: "Expenses" },
          { id: "rpt:requests", title: "Requests" },
          { id: "rpt:customers", title: "Customers" },
        ],
      };
    }

    case "customers": {
      return {
        text: [
          "👥 *Customer Overview*",
          "",
          "📊 *Stats*",
          `• Total customers: *${d.customers.total}*`,
          `• New this month: ${d.customers.newThisMonth}`,
          `• Return rate: ${d.customers.returnRatePct}%`,
          `• Top customer: ${d.customers.top.name} (${fmt(d.customers.top.spent)})`,
          "",
          "🧾 *Recent customers*",
          ...d.customers.recent.map(
            (c) => `• ${c.name} — ${c.orders} order${c.orders !== 1 ? "s" : ""}, ${fmt(c.spent)}`,
          ),
          "",
          "_Tap for more._",
        ].join("\n"),
        buttons: [
          { id: "rpt:sales", title: "Sales" },
          { id: "rpt:overview", title: "Overview" },
        ],
      };
    }

    case "sales": {
      const top3 = d.sales.topProducts.slice(0, 3);
      return {
        text: [
          "💰 *Sales Report*",
          "",
          "📊 *Totals*",
          `• Total sales: *${fmt(d.sales.total)}*`,
          `• This month: ${fmt(d.sales.thisMonth)} (${deltaEmoji(d.sales.deltaPct)} ${Math.abs(d.sales.deltaPct)}%)`,
          `• Today: ${fmt(d.sales.today)}`,
          "",
          "🏆 *Top products*",
          ...top3.map((p) => `• ${p.name}: ${fmt(p.revenue)} (${p.sold} sold)`),
          "",
          "_Tap for more._",
        ].join("\n"),
        buttons: [
          { id: "rpt:customers", title: "Customers" },
          { id: "rpt:overview", title: "Overview" },
        ],
      };
    }

    case "expenses": {
      const expenses = isGuest ? d.expenses : [];
      const total = expenses.reduce((s, e) => s + e.amount, 0);
      const pending = expenses.filter((e) => e.status === "pending").length;
      const approved = expenses.filter((e) => e.status === "approved").length;
      return {
        text: [
          "💸 *Expense Report*",
          "",
          `• Total spent: *${fmt(total)}* across ${expenses.length} entries`,
          pending > 0 ? `• ${pending} pending approval` : null,
          approved > 0 ? `• ${approved} approved` : null,
          "",
          "📋 *Recent*",
          ...expenses.slice(0, 5).map((e) => `• ${e.title} — ${fmt(e.amount)} [${e.status}]`),
          "",
          "_Tap for overview._",
        ].filter(Boolean).join("\n"),
        buttons: [{ id: "rpt:overview", title: "Overview" }],
      };
    }

    case "requests": {
      const requests = isGuest ? d.requests : [];
      const pending = requests.filter((r) => r.status === "pending");
      const approved = requests.filter((r) => r.status === "approved").length;
      return {
        text: [
          "📋 *Requests*",
          "",
          `• Pending: *${pending.length}*`,
          `• Approved: ${approved}`,
          "",
          pending.length > 0 ? "⏳ *Awaiting action*" : null,
          ...pending.map((r) => `• ${r.title} — ${fmt(r.amount)} (${r.requester})`),
          "",
          "_Reply APPROVE or REJECT, or open the dashboard._",
        ].filter(Boolean).join("\n"),
        buttons: [
          { id: "rpt:expenses", title: "Expenses" },
          { id: "rpt:overview", title: "Overview" },
        ],
      };
    }

    case "inventory": {
      const items = isGuest ? d.inventory : (w?.lowInventoryItems ?? []);
      const low = items.filter((i) => i.inStock <= i.minLevel);
      const ok = items.filter((i) => i.inStock > i.minLevel);
      return {
        text: [
          "📦 *Inventory*",
          "",
          low.length > 0 ? `⚠️ *${low.length} item${low.length !== 1 ? "s" : ""} low*` : "✅ All stock levels OK",
          ...low.map((i) => `• ${i.name}: *${i.inStock}* / min ${i.minLevel}`),
          ok.length > 0 ? "" : null,
          ok.length > 0 ? "✅ *In stock*" : null,
          ...ok.slice(0, 5).map((i) => `• ${i.name}: ${i.inStock} / min ${i.minLevel}`),
          "",
          "_Tap for overview._",
        ].filter(Boolean).join("\n"),
        buttons: [{ id: "rpt:overview", title: "Overview" }],
      };
    }

    case "wallet": {
      const balance = isGuest ? ctx.session.demoBalance : d.walletBalance;
      return {
        text: [
          "👛 *Wallet*",
          "",
          `• Balance: *${fmt(balance)}*`,
          isGuest ? `• Demo mode — real balance shown in workspace mode` : null,
          `• Cashback earned: ${fmt(d.cashback)}`,
          "",
          "_Open the dashboard for full transaction history._",
        ].filter(Boolean).join("\n"),
      };
    }

    case "issues": {
      const issues = isGuest ? d.issues : [];
      const open = issues.filter((i) => i.status !== "completed");
      return {
        text: [
          "🔧 *Issues*",
          "",
          `• Open: *${open.length}*`,
          open.length > 0 ? "" : null,
          ...open.map((i) => `• ${severityEmoji(i.severity)} ${i.title} — ${i.area} [${i.status}]`),
          open.length === 0 ? "✅ No open issues." : null,
          "",
          "_Tap for overview._",
        ].filter(Boolean).join("\n"),
        buttons: [{ id: "rpt:overview", title: "Overview" }],
      };
    }

    case "giving": {
      if (isGuest) {
        return {
          text: [
            "🙏 *Giving*",
            "",
            "Giving history is tracked per workspace — set up your own workspace to see real totals here.",
            "",
            `_Try: "I want to give ₦${(20000).toLocaleString("en-NG")} tithe" to see how it works in demo mode._`,
          ].join("\n"),
        };
      }

      const summary = ctx.givingSummary;
      if (!summary || summary.countThisMonth === 0) {
        return {
          text: [
            "🙏 *Giving*",
            "",
            "No giving recorded yet this month.",
            "",
            "_Members can give by saying \"I want to give\" — it takes seconds._",
          ].join("\n"),
          buttons: [{ id: "rpt:overview", title: "Overview" }],
        };
      }

      const delta = deltaPct(summary.totalThisMonth, summary.totalLastMonth);
      const typeLines = Object.entries(summary.byType)
        .sort(([, a], [, b]) => b - a)
        .map(([type, total]) => `• ${type.charAt(0).toUpperCase() + type.slice(1)}: ${fmt(total)}`);

      return {
        text: [
          "🙏 *Giving Report*",
          "",
          `• This month: *${fmt(summary.totalThisMonth)}* from ${summary.countThisMonth} gift${summary.countThisMonth !== 1 ? "s" : ""} (${deltaEmoji(delta)} ${Math.abs(delta)}% vs last month)`,
          "",
          "*By type*",
          ...typeLines,
          "",
          "*Recent*",
          ...summary.recent.slice(0, 3).map((g) => `• ${g.donor} — ${fmt(g.amount)} (${g.givingType}) · ${g.createdAtLabel}`),
          "",
          "_Tap for overview._",
        ].join("\n"),
        buttons: [{ id: "rpt:overview", title: "Overview" }],
      };
    }
  }
}

function deltaPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

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
