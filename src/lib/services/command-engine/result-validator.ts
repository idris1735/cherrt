import type {
  AiCommandResult,
  Appointment,
  ExpenseEntry,
  FeedbackPoll,
  FormDefinition,
  InventoryItem,
  Person,
  SmartDocument,
  WorkflowRequest,
} from "@/lib/types";

const workflowStatuses = new Set(["draft", "pending", "approved", "in-progress", "completed", "flagged"]);
const pollStatuses = new Set(["active", "closed"]);
const pollLanes = new Set(["pulse", "approval", "guest"]);
const documentTypes = new Set(["letter", "invoice", "memo"]);
const artifactKinds = new Set([
  "document",
  "request",
  "event",
  "payment-link",
  "appointment",
  "form",
  "inventory",
  "issue",
  "expense-log",
  "poll",
  "directory",
]);
const moduleKeys = new Set(["toolkit", "church", "store", "events"]);
const issueSeverities = new Set(["low", "medium", "high"]);

function toCleanString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.trim();
  return cleaned || fallback;
}

function toOptionalNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function toStatus(value: unknown, fallback: WorkflowRequest["status"] = "pending"): WorkflowRequest["status"] {
  return typeof value === "string" && workflowStatuses.has(value) ? (value as WorkflowRequest["status"]) : fallback;
}

function normalizeDocument(document: SmartDocument | undefined) {
  if (!document) return undefined;
  if (!documentTypes.has(document.type)) return undefined;

  const title = toCleanString(document.title);
  const body = toCleanString(document.body);
  if (!title || !body) return undefined;

  return {
    ...document,
    title,
    body,
    preparedBy: toCleanString(document.preparedBy, "Chertt AI"),
    status: toStatus(document.status),
    createdAtLabel: toCleanString(document.createdAtLabel, "Just now"),
  } satisfies SmartDocument;
}

function normalizeRequest(request: WorkflowRequest | undefined) {
  if (!request) return undefined;
  if (!moduleKeys.has(request.module)) return undefined;

  const title = toCleanString(request.title);
  const description = toCleanString(request.description);
  const requester = toCleanString(request.requester, "Chertt AI");
  if (!title || !description) return undefined;

  return {
    ...request,
    title,
    description,
    requester,
    type: toCleanString(request.type, "Request"),
    status: toStatus(request.status),
    module: request.module,
    amount: toOptionalNumber(request.amount),
    createdAtLabel: toCleanString(request.createdAtLabel, "Just now"),
    approvalSteps: Array.isArray(request.approvalSteps)
      ? request.approvalSteps
          .map((step) => ({
            ...step,
            label: toCleanString(step.label),
            assignee: toCleanString(step.assignee, "Approver"),
            dueLabel: toCleanString(step.dueLabel, "Pending"),
            completed: Boolean(step.completed),
          }))
          .filter((step) => step.label)
      : [],
  } satisfies WorkflowRequest;
}

function normalizeAppointment(appointment: Appointment | undefined) {
  if (!appointment) return undefined;

  const title = toCleanString(appointment.title);
  const when = toCleanString(appointment.when);
  if (!title || !when) return undefined;

  return {
    ...appointment,
    title,
    when,
    owner: toCleanString(appointment.owner, "Chertt AI"),
  } satisfies Appointment;
}

function normalizeForm(form: FormDefinition | undefined) {
  if (!form) return undefined;
  const name = toCleanString(form.name);
  if (!name) return undefined;

  return {
    ...form,
    name,
    owner: toCleanString(form.owner, "Chertt AI"),
    submissions: typeof form.submissions === "number" && Number.isFinite(form.submissions) ? Math.max(0, form.submissions) : 0,
  } satisfies FormDefinition;
}

function normalizeInventory(item: InventoryItem | undefined) {
  if (!item) return undefined;
  const name = toCleanString(item.name);
  const location = toCleanString(item.location);
  if (!name || !location) return undefined;

  return {
    ...item,
    name,
    location,
    inStock: typeof item.inStock === "number" && Number.isFinite(item.inStock) ? Math.max(0, Math.round(item.inStock)) : 0,
    minLevel: typeof item.minLevel === "number" && Number.isFinite(item.minLevel) ? Math.max(0, Math.round(item.minLevel)) : 0,
    reserved: typeof item.reserved === "number" && Number.isFinite(item.reserved) ? Math.max(0, Math.round(item.reserved)) : 0,
  } satisfies InventoryItem;
}

function normalizeIssue(issue: AiCommandResult["generatedIssueReport"]) {
  if (!issue) return undefined;
  const title = toCleanString(issue.title);
  const area = toCleanString(issue.area);
  if (!title || !area) return undefined;
  if (!issueSeverities.has(issue.severity)) return undefined;

  return {
    ...issue,
    title,
    area,
    reportedBy: toCleanString(issue.reportedBy, "Chertt AI"),
    status: toStatus(issue.status),
    mediaCount: typeof issue.mediaCount === "number" && Number.isFinite(issue.mediaCount) ? Math.max(0, Math.round(issue.mediaCount)) : 0,
  };
}

function normalizeExpense(expense: ExpenseEntry | undefined) {
  if (!expense) return undefined;
  const title = toCleanString(expense.title);
  const department = toCleanString(expense.department);
  if (!title || !department) return undefined;

  return {
    ...expense,
    title,
    department,
    status: toStatus(expense.status),
    amount: typeof expense.amount === "number" && Number.isFinite(expense.amount) ? Math.max(0, expense.amount) : 0,
    receiptCount:
      typeof expense.receiptCount === "number" && Number.isFinite(expense.receiptCount)
        ? Math.max(0, Math.round(expense.receiptCount))
        : 0,
  } satisfies ExpenseEntry;
}

function normalizePoll(poll: FeedbackPoll | undefined) {
  if (!poll) return undefined;
  const title = toCleanString(poll.title);
  if (!title) return undefined;
  if (!pollLanes.has(poll.lane) || !pollStatuses.has(poll.status)) return undefined;

  return {
    ...poll,
    title,
    audience: toCleanString(poll.audience, "All staff"),
    owner: toCleanString(poll.owner, "Chertt AI"),
    questionCount: typeof poll.questionCount === "number" && Number.isFinite(poll.questionCount) ? Math.max(1, Math.round(poll.questionCount)) : 1,
    responseCount: typeof poll.responseCount === "number" && Number.isFinite(poll.responseCount) ? Math.max(0, Math.round(poll.responseCount)) : 0,
    targetCount: typeof poll.targetCount === "number" && Number.isFinite(poll.targetCount) ? Math.max(0, Math.round(poll.targetCount)) : 0,
    updatedAtLabel: toCleanString(poll.updatedAtLabel, "Just now"),
  } satisfies FeedbackPoll;
}

function normalizePerson(person: Person | undefined) {
  if (!person) return undefined;
  const name = toCleanString(person.name);
  if (!name) return undefined;

  return {
    ...person,
    name,
    title: toCleanString(person.title, "Team member"),
    unit: toCleanString(person.unit, "Operations"),
    phone: toCleanString(person.phone, "N/A"),
  } satisfies Person;
}

export function normalizeAiCommandResult(input: AiCommandResult): AiCommandResult {
  const reply = toCleanString(input.reply, "Done. Your request has been captured.");

  const artifact =
    input.artifact && artifactKinds.has(input.artifact.kind)
      ? {
          ...input.artifact,
          headline: toCleanString(input.artifact.headline),
          supportingText: toCleanString(input.artifact.supportingText),
        }
      : undefined;

  return {
    reply,
    artifact: artifact?.headline ? artifact : undefined,
    generatedDocument: normalizeDocument(input.generatedDocument),
    generatedRequest: normalizeRequest(input.generatedRequest),
    generatedPaymentLink: input.generatedPaymentLink
      ? {
          ...input.generatedPaymentLink,
          label: toCleanString(input.generatedPaymentLink.label, "Payment link"),
          amount:
            typeof input.generatedPaymentLink.amount === "number" && Number.isFinite(input.generatedPaymentLink.amount)
              ? Math.max(0, input.generatedPaymentLink.amount)
              : 0,
          status:
            input.generatedPaymentLink.status === "opened" ||
            input.generatedPaymentLink.status === "paid" ||
            input.generatedPaymentLink.status === "generated"
              ? input.generatedPaymentLink.status
              : "generated",
        }
      : undefined,
    generatedAppointment: normalizeAppointment(input.generatedAppointment),
    generatedForm: normalizeForm(input.generatedForm),
    generatedInventoryItem: normalizeInventory(input.generatedInventoryItem),
    generatedIssueReport: normalizeIssue(input.generatedIssueReport),
    generatedExpenseEntry: normalizeExpense(input.generatedExpenseEntry),
    generatedPoll: normalizePoll(input.generatedPoll),
    generatedPerson: normalizePerson(input.generatedPerson),
  };
}
