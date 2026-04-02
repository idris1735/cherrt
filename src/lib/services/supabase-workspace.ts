import type { RealtimeChannel } from "@supabase/supabase-js";

import { cloneSnapshot } from "@/lib/data/seed";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/services/supabase";
import type {
  AiCommandResult,
  Appointment,
  Conversation,
  ExpenseEntry,
  FeedbackPoll,
  FormDefinition,
  InventoryItem,
  IssueReport,
  Message,
  ModuleKey,
  PaymentLink,
  Person,
  SmartDocument,
  WorkflowRequest,
  WorkspaceSnapshot,
} from "@/lib/types";

type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  legal_name: string;
  city: string;
  timezone: string;
};

type RequestRow = {
  id: string;
  module_key: string;
  request_type: string;
  title: string;
  description: string;
  requester_name: string;
  amount: number | null;
  status: string;
  created_at: string;
};

type DocumentRow = {
  id: string;
  title: string;
  document_type: string;
  body: string;
  status: string;
  prepared_by: string;
  awaiting_signature_from: string | null;
  amount: number | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  mode: "ai" | "team";
  title: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  speaker: Message["speaker"];
  body: string;
  created_at: string;
};

type PaymentLinkRow = {
  id: string;
  label: string;
  amount: number;
  status: PaymentLink["status"];
};

type AppointmentRow = {
  id: string;
  title: string;
  when: string;
  owner: string;
  created_at: string;
};

type FormRow = {
  id: string;
  name: string;
  submissions: number;
  owner: string;
  created_at: string;
};

type InventoryRow = {
  id: string;
  name: string;
  location: string;
  in_stock: number;
  min_level: number;
  reserved: number;
};

type IssueRow = {
  id: string;
  title: string;
  area: string;
  severity: IssueReport["severity"];
  status: string;
  media_count: number;
  reported_by: string;
};

type ExpenseRow = {
  id: string;
  title: string;
  department: string;
  amount: number;
  receipt_count: number;
  status: string;
};

type PollRow = {
  id: string;
  title: string;
  lane: FeedbackPoll["lane"];
  audience: string;
  owner: string;
  question_count: number;
  response_count: number;
  target_count: number;
  status: FeedbackPoll["status"];
  updated_at: string;
};

type PersonRow = {
  id: string;
  name: string;
  title: string;
  unit: string;
  phone: string;
};

const tableAvailability = new Map<string, boolean>();

function formatRelativeLabel(dateLike: string) {
  const date = new Date(dateLike);

  if (Number.isNaN(date.getTime())) {
    return "Now";
  }

  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function formatTimeLabel(dateLike: string) {
  const date = new Date(dateLike);

  if (Number.isNaN(date.getTime())) {
    return "Now";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function asModuleKey(moduleKey: string): ModuleKey {
  if (moduleKey === "toolkit" || moduleKey === "church" || moduleKey === "store" || moduleKey === "events") {
    return moduleKey;
  }

  return "toolkit";
}

function mapRequest(row: RequestRow): WorkflowRequest {
  return {
    id: row.id,
    type: row.request_type,
    title: row.title,
    description: row.description,
    requester: row.requester_name,
    amount: row.amount ?? undefined,
    status: row.status as WorkflowRequest["status"],
    module: asModuleKey(row.module_key),
    createdAtLabel: formatRelativeLabel(row.created_at),
    approvalSteps: [
      {
        id: `${row.id}-finance`,
        label: "Finance review",
        assignee: "Finance Desk",
        dueLabel: row.status === "approved" ? "Done" : "Today",
        completed: row.status === "approved",
      },
      {
        id: `${row.id}-lead`,
        label: "Executive approval",
        assignee: "Operations Lead",
        dueLabel: row.status === "approved" ? "Done" : "Pending",
        completed: row.status === "approved",
      },
    ],
  };
}

function mapDocument(row: DocumentRow): SmartDocument {
  return {
    id: row.id,
    title: row.title,
    type: (row.document_type as SmartDocument["type"]) || "memo",
    body: row.body,
    status: row.status as SmartDocument["status"],
    preparedBy: row.prepared_by,
    awaitingSignatureFrom: row.awaiting_signature_from ?? undefined,
    amount: row.amount ?? undefined,
    createdAtLabel: formatRelativeLabel(row.created_at),
  };
}

function mapPaymentLink(row: PaymentLinkRow): PaymentLink {
  return {
    id: row.id,
    label: row.label,
    amount: row.amount,
    status: row.status,
  };
}

function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    title: row.title,
    when: row.when,
    owner: row.owner,
  };
}

function mapForm(row: FormRow): FormDefinition {
  return {
    id: row.id,
    name: row.name,
    submissions: row.submissions,
    owner: row.owner,
  };
}

function mapInventory(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    inStock: row.in_stock,
    minLevel: row.min_level,
    reserved: row.reserved,
  };
}

function mapIssue(row: IssueRow): IssueReport {
  return {
    id: row.id,
    title: row.title,
    area: row.area,
    severity: row.severity,
    status: row.status as IssueReport["status"],
    mediaCount: row.media_count,
    reportedBy: row.reported_by,
  };
}

function mapExpense(row: ExpenseRow): ExpenseEntry {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    amount: row.amount,
    receiptCount: row.receipt_count,
    status: row.status as ExpenseEntry["status"],
  };
}

function mapPoll(row: PollRow): FeedbackPoll {
  return {
    id: row.id,
    title: row.title,
    lane: row.lane,
    audience: row.audience,
    owner: row.owner,
    questionCount: row.question_count,
    responseCount: row.response_count,
    targetCount: row.target_count,
    status: row.status,
    updatedAtLabel: formatRelativeLabel(row.updated_at),
  };
}

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    unit: row.unit,
    phone: row.phone,
  };
}

function buildToolkitActivities(snapshot: WorkspaceSnapshot) {
  const otherActivities = snapshot.activities.filter((activity) => activity.module !== "toolkit");
  const toolkitActivities = [
    ...snapshot.requests
      .filter((request) => request.module === "toolkit")
      .slice(0, 2)
      .map((request) => ({
        id: `activity-request-${request.id}`,
        title: request.title,
        detail: request.description,
        timeLabel: request.createdAtLabel,
        module: "toolkit" as const,
      })),
    ...snapshot.documents.slice(0, 2).map((document) => ({
      id: `activity-document-${document.id}`,
      title: document.title,
      detail: `${document.type} ready in Smart Documents.`,
      timeLabel: document.createdAtLabel,
      module: "toolkit" as const,
    })),
  ].slice(0, 4);

  return [...toolkitActivities, ...otherActivities].slice(0, 4);
}

async function isTableAvailable(table: string) {
  const cached = tableAvailability.get(table);
  if (cached !== undefined) {
    return cached;
  }

  if (!isSupabaseConfigured()) {
    tableAvailability.set(table, false);
    return false;
  }

  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase) {
    tableAvailability.set(table, false);
    return false;
  }

  const { error } = await supabase.from(table).select("id").limit(1);
  const available = !error;
  tableAvailability.set(table, available);
  return available;
}

async function ensureWorkspaceRow(snapshot: WorkspaceSnapshot) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("workspaces"))) {
    return null;
  }

  const { data, error } = await supabase
    .from("workspaces")
    .upsert(
      {
        slug: snapshot.workspace.slug,
        name: snapshot.workspace.name,
        legal_name: snapshot.workspace.legalName,
        city: snapshot.workspace.city,
        timezone: snapshot.workspace.timezone,
      },
      { onConflict: "slug" },
    )
    .select("id, slug, name, legal_name, city, timezone")
    .single();

  if (error) {
    console.error("Supabase workspace upsert failed:", error.message);
    return null;
  }

  return data as WorkspaceRow;
}

async function findWorkspaceRowBySlug(workspaceSlug: string) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("workspaces"))) {
    return null;
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, slug, name, legal_name, city, timezone")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as WorkspaceRow;
}

export async function workspaceExistsInSupabase(workspaceSlug: string) {
  const workspaceRow = await findWorkspaceRowBySlug(workspaceSlug);
  return Boolean(workspaceRow);
}

async function ensureConversationRow(workspaceId: string, conversation: Conversation) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("conversations"))) {
    return null;
  }

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id, mode, title")
    .eq("workspace_id", workspaceId)
    .eq("mode", conversation.mode)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Supabase conversation lookup failed:", existingError.message);
    return null;
  }

  if (existing) {
    return existing as ConversationRow;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      workspace_id: workspaceId,
      mode: conversation.mode,
      title: conversation.title,
    })
    .select("id, mode, title")
    .single();

  if (error) {
    console.error("Supabase conversation insert failed:", error.message);
    return null;
  }

  return data as ConversationRow;
}

export async function loadWorkspaceSnapshotFromSupabase(workspaceSlug: string) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("workspaces"))) {
    return null;
  }

  const workspaceRow = await findWorkspaceRowBySlug(workspaceSlug);
  if (!workspaceRow) {
    return null;
  }

  const [
    canLoadRequests,
    canLoadDocuments,
    canLoadConversations,
    canLoadMessages,
    canLoadPaymentLinks,
    canLoadAppointments,
    canLoadForms,
    canLoadInventory,
    canLoadIssues,
    canLoadExpenses,
    canLoadPolls,
    canLoadPeople,
  ] = await Promise.all([
    isTableAvailable("workflow_requests"),
    isTableAvailable("smart_documents"),
    isTableAvailable("conversations"),
    isTableAvailable("messages"),
    isTableAvailable("payment_links"),
    isTableAvailable("toolkit_appointments"),
    isTableAvailable("toolkit_forms"),
    isTableAvailable("toolkit_inventory_items"),
    isTableAvailable("toolkit_issue_reports"),
    isTableAvailable("toolkit_expense_entries"),
    isTableAvailable("toolkit_feedback_polls"),
    isTableAvailable("toolkit_people"),
  ]);

  const [
    requestsResponse,
    documentsResponse,
    conversationsResponse,
    paymentLinksResponse,
    appointmentsResponse,
    formsResponse,
    inventoryResponse,
    issuesResponse,
    expensesResponse,
    pollsResponse,
    peopleResponse,
  ] = await Promise.all([
    canLoadRequests
      ? supabase
          .from("workflow_requests")
          .select("id, module_key, request_type, title, description, requester_name, amount, status, created_at")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as RequestRow[], error: null }),
    canLoadDocuments
      ? supabase
          .from("smart_documents")
          .select("id, title, document_type, body, status, prepared_by, awaiting_signature_from, amount, created_at")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as DocumentRow[], error: null }),
    canLoadConversations
      ? supabase
          .from("conversations")
          .select("id, mode, title")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as ConversationRow[], error: null }),
    canLoadPaymentLinks
      ? supabase
          .from("payment_links")
          .select("id, label, amount, status")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as PaymentLinkRow[], error: null }),
    canLoadAppointments
      ? supabase
          .from("toolkit_appointments")
          .select('id, title, "when", owner, created_at')
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as AppointmentRow[], error: null }),
    canLoadForms
      ? supabase
          .from("toolkit_forms")
          .select("id, name, submissions, owner, created_at")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as FormRow[], error: null }),
    canLoadInventory
      ? supabase
          .from("toolkit_inventory_items")
          .select("id, name, location, in_stock, min_level, reserved")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as InventoryRow[], error: null }),
    canLoadIssues
      ? supabase
          .from("toolkit_issue_reports")
          .select("id, title, area, severity, status, media_count, reported_by")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as IssueRow[], error: null }),
    canLoadExpenses
      ? supabase
          .from("toolkit_expense_entries")
          .select("id, title, department, amount, receipt_count, status")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ExpenseRow[], error: null }),
    canLoadPolls
      ? supabase
          .from("toolkit_feedback_polls")
          .select("id, title, lane, audience, owner, question_count, response_count, target_count, status, updated_at")
          .eq("workspace_id", workspaceRow.id)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as PollRow[], error: null }),
    canLoadPeople
      ? supabase
          .from("toolkit_people")
          .select("id, name, title, unit, phone")
          .eq("workspace_id", workspaceRow.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as PersonRow[], error: null }),
  ]);

  if (
    requestsResponse.error ||
    documentsResponse.error ||
    conversationsResponse.error ||
    paymentLinksResponse.error ||
    appointmentsResponse.error ||
    formsResponse.error ||
    inventoryResponse.error ||
    issuesResponse.error ||
    expensesResponse.error ||
    pollsResponse.error ||
    peopleResponse.error
  ) {
    return null;
  }

  const conversationIds = ((conversationsResponse.data as ConversationRow[]) ?? []).map((conversation) => conversation.id);
  const messagesResponse =
    canLoadMessages && conversationIds.length
      ? await supabase
          .from("messages")
          .select("id, conversation_id, speaker, body, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
      : { data: [] as MessageRow[], error: null };

  if (messagesResponse.error) {
    return null;
  }

  const snapshot = cloneSnapshot();
  snapshot.workspace = {
    ...snapshot.workspace,
    id: workspaceRow.id,
    slug: workspaceRow.slug,
    name: workspaceRow.name,
    legalName: workspaceRow.legal_name,
    city: workspaceRow.city,
    timezone: workspaceRow.timezone,
  };

  const remoteRequests = (requestsResponse.data as RequestRow[]).map(mapRequest);
  snapshot.requests = [
    ...remoteRequests,
    ...snapshot.requests.filter((request) => request.module !== "toolkit"),
  ];

  snapshot.documents = (documentsResponse.data as DocumentRow[]).length
    ? (documentsResponse.data as DocumentRow[]).map(mapDocument)
    : snapshot.documents;
  snapshot.paymentLinks = (paymentLinksResponse.data as PaymentLinkRow[]).length
    ? (paymentLinksResponse.data as PaymentLinkRow[]).map(mapPaymentLink)
    : snapshot.paymentLinks;
  snapshot.appointments = (appointmentsResponse.data as AppointmentRow[]).length
    ? (appointmentsResponse.data as AppointmentRow[]).map(mapAppointment)
    : snapshot.appointments;
  snapshot.forms = (formsResponse.data as FormRow[]).length
    ? (formsResponse.data as FormRow[]).map(mapForm)
    : snapshot.forms;
  snapshot.inventory = (inventoryResponse.data as InventoryRow[]).length
    ? (inventoryResponse.data as InventoryRow[]).map(mapInventory)
    : snapshot.inventory;
  snapshot.issues = (issuesResponse.data as IssueRow[]).length
    ? (issuesResponse.data as IssueRow[]).map(mapIssue)
    : snapshot.issues;
  snapshot.expenses = (expensesResponse.data as ExpenseRow[]).length
    ? (expensesResponse.data as ExpenseRow[]).map(mapExpense)
    : snapshot.expenses;
  snapshot.polls = (pollsResponse.data as PollRow[]).length
    ? (pollsResponse.data as PollRow[]).map(mapPoll)
    : snapshot.polls;
  snapshot.directory = (peopleResponse.data as PersonRow[]).length
    ? (peopleResponse.data as PersonRow[]).map(mapPerson)
    : snapshot.directory;

  const messagesByConversation = new Map<string, Message[]>();
  for (const row of messagesResponse.data as MessageRow[]) {
    const current = messagesByConversation.get(row.conversation_id) ?? [];
    current.push({
      id: row.id,
      speaker: row.speaker,
      text: row.body,
      timeLabel: formatTimeLabel(row.created_at),
    });
    messagesByConversation.set(row.conversation_id, current);
  }

  const fallbackConversations = cloneSnapshot().conversations;
  snapshot.conversations = (conversationsResponse.data as ConversationRow[]).length
    ? (conversationsResponse.data as ConversationRow[]).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        mode: conversation.mode,
        messages: messagesByConversation.get(conversation.id) ?? [],
      }))
    : fallbackConversations;

  snapshot.activities = buildToolkitActivities(snapshot);
  return snapshot;
}

export async function subscribeToWorkspaceSnapshot(
  workspaceSlug: string,
  onSnapshot: (snapshot: WorkspaceSnapshot) => void,
) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("workspaces"))) {
    return () => {};
  }

  const workspaceRow = await findWorkspaceRowBySlug(workspaceSlug);
  if (!workspaceRow) {
    return () => {};
  }

  const candidateTables = [
    "workflow_requests",
    "smart_documents",
    "conversations",
    "messages",
    "payment_links",
    "toolkit_appointments",
    "toolkit_forms",
    "toolkit_inventory_items",
    "toolkit_issue_reports",
    "toolkit_expense_entries",
    "toolkit_feedback_polls",
    "toolkit_people",
  ];

  const availableTables = (
    await Promise.all(candidateTables.map(async (table) => ((await isTableAvailable(table)) ? table : null)))
  ).filter((table): table is string => Boolean(table));

  if (!availableTables.length) {
    return () => {};
  }

  let refreshScheduled = false;
  let unsubscribed = false;

  const scheduleRefresh = () => {
    if (refreshScheduled || unsubscribed) {
      return;
    }

    refreshScheduled = true;
    window.setTimeout(async () => {
      refreshScheduled = false;
      if (unsubscribed) {
        return;
      }

      const snapshot = await loadWorkspaceSnapshotFromSupabase(workspaceSlug);
      if (snapshot) {
        onSnapshot(snapshot);
      }
    }, 150);
  };

  const channel: RealtimeChannel = supabase.channel(`workspace-sync:${workspaceRow.id}`);

  for (const table of availableTables) {
    const filter =
      table === "messages"
        ? undefined
        : table === "conversations"
          ? `workspace_id=eq.${workspaceRow.id}`
          : `workspace_id=eq.${workspaceRow.id}`;

    channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, scheduleRefresh);
  }

  channel.subscribe();

  return () => {
    unsubscribed = true;
    void supabase.removeChannel(channel);
  };
}

export async function persistConversationMessage(snapshot: WorkspaceSnapshot, conversation: Conversation, message: Message) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("messages"))) {
    return false;
  }

  const workspace = await ensureWorkspaceRow(snapshot);
  if (!workspace) {
    return false;
  }

  const conversationRow = await ensureConversationRow(workspace.id, conversation);
  if (!conversationRow) {
    return false;
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationRow.id,
    speaker: message.speaker,
    body: message.text,
  });

  if (error) {
    console.error("Supabase message insert failed:", error.message);
    return false;
  }

  return true;
}

export async function persistAiResult(snapshot: WorkspaceSnapshot, result: AiCommandResult) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("workspaces"))) {
    return false;
  }

  const workspace = await ensureWorkspaceRow(snapshot);
  if (!workspace) {
    return false;
  }

  const [
    canWriteRequests,
    canWriteDocuments,
    canWritePaymentLinks,
    canWriteAppointments,
    canWriteForms,
  ] = await Promise.all([
    isTableAvailable("workflow_requests"),
    isTableAvailable("smart_documents"),
    isTableAvailable("payment_links"),
    isTableAvailable("toolkit_appointments"),
    isTableAvailable("toolkit_forms"),
  ]);

  const writes: Array<PromiseLike<{ error: { message: string } | null }>> = [];

  if (result.generatedRequest && canWriteRequests) {
    writes.push(
      supabase.from("workflow_requests").upsert({
        id: result.generatedRequest.id,
        workspace_id: workspace.id,
        module_key: result.generatedRequest.module,
        request_type: result.generatedRequest.type,
        title: result.generatedRequest.title,
        description: result.generatedRequest.description,
        requester_name: result.generatedRequest.requester,
        amount: result.generatedRequest.amount ?? null,
        status: result.generatedRequest.status,
      }),
    );
  }

  if (result.generatedDocument && canWriteDocuments) {
    writes.push(
      supabase.from("smart_documents").upsert({
        id: result.generatedDocument.id,
        workspace_id: workspace.id,
        title: result.generatedDocument.title,
        document_type: result.generatedDocument.type,
        body: result.generatedDocument.body,
        status: result.generatedDocument.status,
        prepared_by: result.generatedDocument.preparedBy,
        awaiting_signature_from: result.generatedDocument.awaitingSignatureFrom ?? null,
        amount: result.generatedDocument.amount ?? null,
      }),
    );
  }

  if (result.generatedPaymentLink && canWritePaymentLinks) {
    writes.push(
      supabase.from("payment_links").upsert({
        id: result.generatedPaymentLink.id,
        workspace_id: workspace.id,
        label: result.generatedPaymentLink.label,
        amount: result.generatedPaymentLink.amount,
        status: result.generatedPaymentLink.status,
      }),
    );
  }

  if (result.generatedAppointment && canWriteAppointments) {
    writes.push(
      supabase.from("toolkit_appointments").upsert({
        id: result.generatedAppointment.id,
        workspace_id: workspace.id,
        title: result.generatedAppointment.title,
        when: result.generatedAppointment.when,
        owner: result.generatedAppointment.owner,
      }),
    );
  }

  if (result.generatedForm && canWriteForms) {
    writes.push(
      supabase.from("toolkit_forms").upsert({
        id: result.generatedForm.id,
        workspace_id: workspace.id,
        name: result.generatedForm.name,
        submissions: result.generatedForm.submissions,
        owner: result.generatedForm.owner,
      }),
    );
  }

  if (!writes.length) {
    return true;
  }

  const results = await Promise.all(writes);
  const firstError = results.find(
    (value): value is { error: { message: string } } =>
      typeof value === "object" && value !== null && "error" in value && Boolean((value as { error?: unknown }).error),
  );

  if (firstError?.error) {
    console.error("Supabase AI result persistence failed:", firstError.error.message);
    return false;
  }

  return true;
}

export async function persistApprovedRequest(snapshot: WorkspaceSnapshot, requestId: string) {
  const supabase = getSupabaseBrowserClient() as any;
  if (!supabase || !(await isTableAvailable("workflow_requests"))) {
    return false;
  }

  const { error } = await supabase
    .from("workflow_requests")
    .update({ status: "approved" })
    .eq("id", requestId)
    .eq("workspace_id", snapshot.workspace.id);

  if (error) {
    console.error("Supabase request approval failed:", error.message);
    return false;
  }

  return true;
}
