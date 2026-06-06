/**
 * Unified workspace data loader — reads ALL entities from Supabase.
 * Falls back to shared demo data if Supabase is unavailable or tables are empty.
 * Never throws — always returns data.
 */
import { getDemoWorkspaceData } from "@/lib/data/demo-workspace";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { WorkspaceData } from "@/lib/services/business-metrics";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function loadWorkspaceData(workspaceId: string): Promise<WorkspaceData> {
  const fallback = getDemoWorkspaceData();

  if (!isUuid(workspaceId)) return fallback;

  const db = getSupabaseServerClient();
  if (!db) return fallback;

  try {
    const [
      { data: requests },
      { data: expenses },
      { data: issues },
      { data: inventory },
      { data: documents },
      { data: orders },
      { data: customers },
      { data: walletTxns },
    ] = await Promise.all([
      db.from("workflow_requests").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      db.from("toolkit_expense_entries").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      db.from("toolkit_issue_reports").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      db.from("toolkit_inventory_items").select("*").eq("workspace_id", workspaceId),
      db.from("smart_documents").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      db.from("toolkit_orders").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      db.from("toolkit_customers").select("*").eq("workspace_id", workspaceId),
      db.from("toolkit_wallet_transactions").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    ]);

    const hasLiveData = (requests?.length ?? 0) > 0 || (expenses?.length ?? 0) > 0;
    if (!hasLiveData) return fallback;

    return {
      requests: (requests ?? []).map(mapRequestRow),
      expenses: (expenses ?? []).map(mapExpenseRow),
      issues: (issues ?? []).map(mapIssueRow),
      inventory: (inventory ?? []).map(mapInventoryRow),
      documents: (documents ?? []).map(mapDocRow),
      orders: (orders ?? []).map(mapOrderRow),
      customers: (customers ?? []).map(mapCustomerRow),
      walletTransactions: (walletTxns ?? []).map(mapWalletRow),
    };
  } catch {
    return fallback;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapRequestRow(r: any) {
  return {
    id: r.id, type: r.request_type ?? "Expense", title: r.title ?? "",
    description: r.description ?? "", requester: r.requester_name ?? "",
    amount: r.amount ?? undefined, status: r.status ?? "pending",
    module: (r.module_key ?? "toolkit") as any,
    createdAtLabel: r.created_at ?? "", approvalSteps: [],
  };
}

function mapExpenseRow(r: any) {
  return {
    id: r.id, title: r.title ?? "", department: r.department ?? "General",
    amount: r.amount ?? 0, status: r.status ?? "pending",
    receiptCount: r.receipt_count ?? 0,
    attachments: r.attachment_urls ?? [],
    createdAtLabel: r.created_at ?? "",
  };
}

function mapIssueRow(r: any) {
  return {
    id: r.id, title: r.title ?? "", area: r.area ?? "",
    severity: r.severity ?? "medium", status: r.status ?? "pending",
    reportedBy: r.reported_by ?? "", mediaCount: r.media_count ?? 0,
    attachments: r.attachment_urls ?? [],
  };
}

function mapInventoryRow(r: any) {
  return {
    id: r.id, name: r.name ?? "", location: r.location ?? "",
    inStock: r.in_stock ?? 0, minLevel: r.min_level ?? 5, reserved: r.reserved ?? 0,
  };
}

function mapDocRow(r: any) {
  return {
    id: r.id, title: r.title ?? "", type: r.document_type ?? "letter",
    body: r.body ?? "", status: r.status ?? "draft",
    preparedBy: r.prepared_by ?? "",
    awaitingSignatureFrom: r.awaiting_signature_from ?? undefined,
    amount: r.amount ?? undefined,
    createdAtLabel: r.created_at ?? "",
  };
}

function mapOrderRow(r: any) {
  return {
    id: r.id, total: r.total ?? 0, customerId: r.customer_id ?? "",
    createdAt: r.created_at ?? "",
  };
}

function mapCustomerRow(r: any) {
  return {
    id: r.id, name: r.name ?? "", totalSpent: r.total_spent ?? 0,
    orderCount: r.order_count ?? 0,
  };
}

function mapWalletRow(r: any) {
  return {
    id: r.id, amount: r.amount ?? 0, type: r.type ?? "credit",
    label: r.label ?? "", createdAt: r.created_at ?? "",
  };
}
