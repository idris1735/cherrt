import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { buildKnowledgeContextString, demoKnowledgeArticles, type KnowledgeArticle } from "@/lib/data/knowledge";
import type { AiCommandResult } from "@/lib/types";

export type PhoneLink = {
  phoneNumber: string;
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  userName: string;
  userRole: string;
};

export type WorkspaceContext = {
  pendingRequests: Array<{ id: string; title: string; amount: number | null; requester: string }>;
  recentExpenses: Array<{ title: string; amount: number }>;
  lowInventoryItems: Array<{ name: string; inStock: number; minLevel: number }>;
  pendingIssues: Array<{ title: string; severity: string }>;
};

export async function lookupPhoneLink(phoneNumber: string): Promise<PhoneLink | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const { data } = await db
    .from("whatsapp_phone_links")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (!data) return null;
  return {
    phoneNumber: data.phone_number,
    userId: data.user_id,
    workspaceId: data.workspace_id,
    workspaceSlug: data.workspace_slug,
    workspaceName: data.workspace_name,
    userName: data.user_name,
    userRole: data.user_role,
  };
}

export async function persistWorkspaceAiResult(
  workspaceId: string,
  userName: string,
  result: AiCommandResult,
): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;

  const writes: PromiseLike<unknown>[] = [];

  if (result.generatedRequest) {
    writes.push(db.from("workflow_requests").upsert({
      id: result.generatedRequest.id,
      workspace_id: workspaceId,
      module_key: result.generatedRequest.module ?? "toolkit",
      request_type: result.generatedRequest.type,
      title: result.generatedRequest.title,
      description: result.generatedRequest.description,
      requester_name: result.generatedRequest.requester ?? userName,
      amount: result.generatedRequest.amount ?? null,
      status: result.generatedRequest.status ?? "pending",
    }));
  }

  if (result.generatedDocument) {
    writes.push(db.from("smart_documents").upsert({
      id: result.generatedDocument.id,
      workspace_id: workspaceId,
      title: result.generatedDocument.title,
      document_type: result.generatedDocument.type,
      body: result.generatedDocument.body,
      status: result.generatedDocument.status ?? "draft",
      prepared_by: result.generatedDocument.preparedBy ?? userName,
      awaiting_signature_from: result.generatedDocument.awaitingSignatureFrom ?? null,
      amount: result.generatedDocument.amount ?? null,
    }));
  }

  if (result.generatedExpenseEntry) {
    writes.push(db.from("toolkit_expense_entries").upsert({
      id: result.generatedExpenseEntry.id,
      workspace_id: workspaceId,
      title: result.generatedExpenseEntry.title,
      department: result.generatedExpenseEntry.department ?? "General",
      amount: result.generatedExpenseEntry.amount,
      status: result.generatedExpenseEntry.status ?? "pending",
    }));
  }

  if (result.generatedIssueReport) {
    writes.push(db.from("toolkit_issue_reports").upsert({
      id: result.generatedIssueReport.id,
      workspace_id: workspaceId,
      title: result.generatedIssueReport.title,
      area: result.generatedIssueReport.area ?? "General",
      severity: result.generatedIssueReport.severity ?? "medium",
      status: result.generatedIssueReport.status ?? "pending",
      reported_by: result.generatedIssueReport.reportedBy ?? userName,
    }));
  }

  if (result.generatedInventoryItem) {
    writes.push(db.from("toolkit_inventory_items").upsert({
      id: result.generatedInventoryItem.id,
      workspace_id: workspaceId,
      name: result.generatedInventoryItem.name,
      in_stock: result.generatedInventoryItem.inStock,
      min_level: result.generatedInventoryItem.minLevel ?? 0,
      location: result.generatedInventoryItem.location ?? "",
    }));
  }

  if (result.generatedAppointment) {
    writes.push(db.from("toolkit_appointments").upsert({
      id: result.generatedAppointment.id,
      workspace_id: workspaceId,
      title: result.generatedAppointment.title,
      when: result.generatedAppointment.when,
      owner: result.generatedAppointment.owner ?? userName,
    }));
  }

  if (result.generatedPoll) {
    writes.push(db.from("toolkit_feedback_polls").upsert({
      id: result.generatedPoll.id,
      workspace_id: workspaceId,
      title: result.generatedPoll.title,
      lane: result.generatedPoll.lane ?? "pulse",
      audience: result.generatedPoll.audience ?? "",
      owner: result.generatedPoll.owner ?? userName,
      question_count: result.generatedPoll.questionCount ?? 1,
      response_count: 0,
    }));
  }

  if (result.generatedForm) {
    writes.push(db.from("toolkit_forms").upsert({
      id: result.generatedForm.id,
      workspace_id: workspaceId,
      name: result.generatedForm.name,
      owner: result.generatedForm.owner ?? userName,
      submission_count: 0,
    }));
  }

  if (result.generatedPerson) {
    writes.push(db.from("toolkit_people").upsert({
      id: result.generatedPerson.id,
      workspace_id: workspaceId,
      name: result.generatedPerson.name,
      title: result.generatedPerson.title ?? "",
      unit: result.generatedPerson.unit ?? "",
      phone: result.generatedPerson.phone ?? "",
    }));
  }

  await Promise.allSettled(writes.map((w) => Promise.resolve(w)));
}

// Returns the owner/admin phone number for approval notifications
export async function getApproverPhone(workspaceId: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const { data: members } = await db
    .from("memberships")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])
    .limit(1);

  if (!members?.length) return null;
  const ownerId = members[0].user_id;

  const { data: link } = await db
    .from("whatsapp_phone_links")
    .select("phone_number")
    .eq("user_id", ownerId)
    .maybeSingle();

  return link?.phone_number ?? null;
}

export async function approveWorkspaceRequest(requestId: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await db.from("workflow_requests").update({ status: "approved" }).eq("id", requestId);
  return !error;
}

export async function rejectWorkspaceRequest(requestId: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await db.from("workflow_requests").update({ status: "flagged" }).eq("id", requestId);
  return !error;
}

export async function loadKnowledgeContext(workspaceId: string): Promise<string> {
  const db = getSupabaseServerClient();
  if (!db) return buildKnowledgeContextString(demoKnowledgeArticles);

  const { data } = await db
    .from("toolkit_knowledge_articles")
    .select("id, type, title, body, tags")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  const articles: KnowledgeArticle[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.type as KnowledgeArticle["type"],
    title: r.title as string,
    body: r.body as string,
    tags: (r.tags as string[]) ?? [],
  }));

  // Fall back to demo KB if workspace hasn't seeded its own yet
  return buildKnowledgeContextString(articles.length ? articles : demoKnowledgeArticles);
}

export async function getWorkflowRequest(
  requestId: string,
): Promise<{ title: string; amount: number | null } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await db
    .from("workflow_requests")
    .select("title, amount")
    .eq("id", requestId)
    .maybeSingle();
  return data ?? null;
}

export async function loadWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
  const db = getSupabaseServerClient();
  if (!db) return { pendingRequests: [], recentExpenses: [], lowInventoryItems: [], pendingIssues: [] };

  const [reqRes, expRes, invRes, issRes] = await Promise.allSettled([
    db.from("workflow_requests")
      .select("id, title, amount, requester_name")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),

    db.from("toolkit_expense_entries")
      .select("title, amount")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),

    db.from("toolkit_inventory_items")
      .select("name, in_stock, min_level")
      .eq("workspace_id", workspaceId)
      .limit(20),

    db.from("toolkit_issue_reports")
      .select("title, severity")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "in-progress"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const pendingRequests =
    reqRes.status === "fulfilled" && reqRes.value.data
      ? reqRes.value.data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          title: r.title as string,
          amount: r.amount as number | null,
          requester: r.requester_name as string,
        }))
      : [];

  const recentExpenses =
    expRes.status === "fulfilled" && expRes.value.data
      ? expRes.value.data.map((e: Record<string, unknown>) => ({
          title: e.title as string,
          amount: e.amount as number,
        }))
      : [];

  const lowInventoryItems =
    invRes.status === "fulfilled" && invRes.value.data
      ? (invRes.value.data as Array<Record<string, unknown>>)
          .filter((i) => (i.in_stock as number) <= (i.min_level as number))
          .map((i) => ({ name: i.name as string, inStock: i.in_stock as number, minLevel: i.min_level as number }))
      : [];

  const pendingIssues =
    issRes.status === "fulfilled" && issRes.value.data
      ? issRes.value.data.map((i: Record<string, unknown>) => ({
          title: i.title as string,
          severity: i.severity as string,
        }))
      : [];

  return { pendingRequests, recentExpenses, lowInventoryItems, pendingIssues };
}
