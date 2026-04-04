import { GoogleGenAI } from "@google/genai";
import { getCapabilityById } from "@/lib/services/command-engine/capability-registry";
import { resolveCapabilityIntent } from "@/lib/services/command-engine/intent-router";
import { evaluateCapabilityAccess } from "@/lib/services/command-engine/policy-guard";
import { normalizeAiCommandResult } from "@/lib/services/command-engine/result-validator";

import type {
  AiCommandResult,
  Appointment,
  ExpenseEntry,
  FeedbackPoll,
  FormDefinition,
  GivingRecord,
  InventoryItem,
  ModuleKey,
  PaymentLink,
  Person,
  Role,
  IssueReport,
  SmartDocument,
  WorkflowRequest,
} from "@/lib/types";

function createId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now().toString(36)}`;
}

type GeminiResponse = {
  reply: string;
  artifactKind:
    | "document"
    | "request"
    | "payment-link"
    | "appointment"
    | "form"
    | "inventory"
    | "issue"
    | "expense-log"
    | "poll"
    | "directory"
    | "giving"
    | "none";
  artifactHeadline: string;
  artifactDetail: string;
  documentTitle: string;
  documentBody: string;
  documentType: "letter" | "invoice" | "memo" | "";
  requestTitle: string;
  requestDescription: string;
  requestType: "Expense" | "Maintenance" | "Approval" | "Supply" | "";
  requestAmount: number | null;
  appointmentTitle: string;
  appointmentWhen: string;
  appointmentOwner: string;
  formName: string;
  formOwner: string;
  inventoryItemName: string;
  inventoryLocation: string;
  inventoryInStock: number | null;
  inventoryMinLevel: number | null;
  issueTitle: string;
  issueArea: string;
  issueSeverity: "low" | "medium" | "high" | "";
  issueStatus: "pending" | "in-progress" | "completed" | "flagged" | "";
  issueReportedBy: string;
  expenseTitle: string;
  expenseDepartment: string;
  expenseAmount: number | null;
  expenseStatus: "pending" | "approved" | "in-progress" | "completed" | "flagged" | "";
  pollTitle: string;
  pollLane: "pulse" | "approval" | "guest" | "";
  pollAudience: string;
  pollOwner: string;
  pollQuestionCount: number | null;
  directoryName: string;
  directoryTitle: string;
  directoryUnit: string;
  directoryPhone: string;
  givingChurchName: string;
  givingAmount: number | null;
  givingType: string;
};

export type CommandExecutionContext = {
  role?: Role;
  enabledModules?: ModuleKey[];
  history?: Array<{ speaker: string; text: string }>;
  memoryContext?: string;
  userName?: string;
  userTitle?: string;
  userOrganization?: string;
};

const SYSTEM_PROMPT = `You are Chertt, a chat-first AI assistant for organizations. You handle all operational, financial, administrative, and community work through natural conversation.

Role:
- You think like an operations lead, finance coordinator, admin desk, facilities manager, pastoral coordinator, and executive assistant combined.
- You do not answer like a generic chatbot. You answer like someone helping a real organization move work forward efficiently.

What you handle:
- Documents: letters, memos, invoices, contracts — draft, route for signature, approve
- Requests and approvals: expense, supply, maintenance, admin approvals
- Finance: log expenses, create payment links, record invoices, track giving and offerings
- People: staff directory entries, onboarding, appointments and scheduling
- Operations: inventory, stock levels, facility issue reporting
- Church and community: giving records, tithes, offerings, church payments, child check-ins, care requests, pastoral notes
- Events: registrations, tickets, guest management
- Store: orders, products, payment collection, receipts

Memory and history:
- You receive the recent conversation history and a snapshot of workspace records.
- Use this context to answer historical questions like "what was that last payment?", "show me my pending requests", "what did I pay last week?", "pull up that document".
- Reference specific records by name, amount, date, or status when answering.
- If the user references something from a previous message, check the conversation history first.

Payments and giving:
- Church payments (tithes, offerings, donations to a church): use artifactKind "giving". Set givingChurchName to the church name, givingAmount to the amount, givingType to "tithe" | "offering" | "donation" | "pledge".
- If the user wants to pay/give to a church but hasn't said which church: ask in the reply with artifactKind "none".
- If the amount is not mentioned for giving or payment-link: ask for it in the reply, use artifactKind "none".
- Payment links for collecting money from others: use artifactKind "payment-link" with requestAmount.
- Logging expenses or petty cash: use artifactKind "expense-log".
- You CANNOT (yet): execute actual live bank transfers — that requires payment gateway integration. Tell the user this clearly if they ask.

Product behavior:
- Chat-first: users speak naturally and casually. Translate messy requests into clean structured work.
- Make a sensible first draft instead of refusing incomplete requests.
- Do not use time-based greetings unless the user uses them first.
- Avoid filler lines like "How can I help today?" or "I'm here to help."
- Lead with the work: what you understood, what you created, or what the next step is.
- Keep replies short and warm — they display inside a mobile chat bubble.

Identity rules:
- NEVER use "Chertt AI" as an author, preparedBy, requester, reportedBy, owner, or any person name in created records.
- The user's real name and title are provided in the identity block. Use them everywhere — document closings, request raisers, appointment owners.
- For letters: close with "Warm regards,\n[Full Name]\n[Job Title]" using the real identity. If no title is known, just the name.
- For memos: preparedBy is the real name. Sign-off in the document body uses the real name.

Return valid JSON only. No code fences. No commentary outside JSON.

Use this exact shape:
{
  "reply": "short direct response",
  "artifactKind": "document" | "request" | "payment-link" | "appointment" | "form" | "inventory" | "issue" | "expense-log" | "poll" | "directory" | "giving" | "none",
  "artifactHeadline": "short title or empty string",
  "artifactDetail": "one sentence or empty string",
  "documentTitle": "string",
  "documentBody": "string",
  "documentType": "letter" | "invoice" | "memo" | "",
  "requestTitle": "string",
  "requestDescription": "string",
  "requestType": "Expense" | "Maintenance" | "Approval" | "Supply" | "",
  "requestAmount": null or number,
  "appointmentTitle": "string",
  "appointmentWhen": "ISO date-time string or natural date e.g. 2026-04-10 or 2026-04-10T10:00",
  "appointmentOwner": "string",
  "formName": "string",
  "formOwner": "string",
  "inventoryItemName": "string",
  "inventoryLocation": "string",
  "inventoryInStock": null or number,
  "inventoryMinLevel": null or number,
  "issueTitle": "string",
  "issueArea": "string",
  "issueSeverity": "low" | "medium" | "high" | "",
  "issueStatus": "pending" | "in-progress" | "completed" | "flagged" | "",
  "issueReportedBy": "string",
  "expenseTitle": "string",
  "expenseDepartment": "string",
  "expenseAmount": null or number,
  "expenseStatus": "pending" | "approved" | "in-progress" | "completed" | "flagged" | "",
  "pollTitle": "string",
  "pollLane": "pulse" | "approval" | "guest" | "",
  "pollAudience": "string",
  "pollOwner": "string",
  "pollQuestionCount": null or number,
  "directoryName": "string",
  "directoryTitle": "string",
  "directoryUnit": "string",
  "directoryPhone": "string",
  "givingChurchName": "string",
  "givingAmount": null or number,
  "givingType": "tithe" | "offering" | "donation" | "pledge" | ""
}

Rules:
- Drafting letters, memos, invoices -> artifactKind "document"
- If the user asks to draft or write a report, summary, memo, or formal note, prefer artifactKind "document" with documentType "memo" unless they are clearly reporting a live operational issue.
- Expense, repairs, approvals, supplies -> artifactKind "request"
- Payment links and invoice collection -> artifactKind "payment-link"
- Scheduling meetings or visits -> artifactKind "appointment"; appointmentWhen should be a proper date string like "2026-04-10" or "2026-04-10 10:00 AM" — never vague like "tomorrow" or "next week"
- Creating internal forms -> artifactKind "form"
- Adding or updating stock items -> artifactKind "inventory"
- Logging facility incidents or faults -> artifactKind "issue"
- Logging petty cash or ledger expenses -> artifactKind "expense-log"
- Creating surveys, polls, or feedback forms -> artifactKind "poll"
- Adding a staff contact card -> artifactKind "directory"
- Paying tithes, offerings, or donations to a church -> artifactKind "giving"
- Directory lookup, FAQ, or process recall without creating a new record -> artifactKind "none"
- IMPORTANT: If a payment or giving amount is not specified, set artifactKind to "none" and ask for the amount in the reply.
- Keep the reply warm, concise, and product-aware.
- The reply should read well inside a mobile chat bubble.
- You may use markdown in the reply: **bold** for key terms or names, bullet lists (- item) for steps or options, numbered lists for sequences. Keep formatting purposeful — do not over-format a one-line answer.
- Keep the tone calm, capable, and operational.
- If you create a record, say what you created and what happens next.
- If you recall knowledge, give the answer directly and include the most useful next action.
- If you draft a document body, make it polished, professional, and ready for review.
- For documentBody with documentType "memo": use markdown — ## for section headers (## Summary, ## Context, ## Next Actions), - for bullet lists.
- For documentBody with documentType "letter": use standard letter format — salutation line, body paragraphs, closing and name. No markdown headers.
- For documentBody with documentType "invoice": use a clean structured format — recipient info, itemised list with amounts, total line. Use markdown ## for section headings.`;

function formatReply(reply: string) {
  return reply
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function toSentence(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function buildFallbackLetterDraft(prompt: string, author = "You") {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");

  const recipientMatch =
    cleanPrompt.match(/(?:letter|email|message|write)\s+(?:to|for)\s+([a-zA-Z][a-zA-Z\s.'-]{1,48})/i) ??
    cleanPrompt.match(/\bto\s+([a-zA-Z][a-zA-Z\s.'-]{1,48})/i);

  const rawRecipient = recipientMatch?.[1] ?? "";
  const recipient = toTitleCase(rawRecipient.split(/\bthat\b|\babout\b|\bregarding\b|\bon\b/i)[0] ?? "").trim();

  const intentMatch = cleanPrompt.match(/\b(?:that|about|regarding|on)\s+(.+)$/i);
  const intent = intentMatch?.[1]?.trim();

  const intentLine = intent
    ? toSentence(intent)
    : "I am writing to share this message clearly and respectfully.";

  const title = recipient ? `Letter to ${recipient}` : "Draft letter";
  const salutation = recipient ? `Dear ${recipient},` : "Dear Team,";

  const body = `${salutation}\n\n${intentLine}\n\nI wanted to put this in writing so the message is clear and sincere.\n\nWarm regards,\n${author}`;

  return {
    title,
    body,
  };
}

function buildFallbackMemoDraft(prompt: string) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  const summary = toSentence(cleanPrompt);

  return {
    title: "Operational memo draft",
    body: `## Summary\n\n${summary}\n\n## Context\n\nThis draft was prepared from your prompt and is ready for review and editing.\n\n## Next actions\n\n- Confirm owners and responsibilities\n- Confirm timeline and deadlines\n- Route for approval if required`,
  };
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new GoogleGenAI({ apiKey });
}

async function callGemini(
  prompt: string,
  capabilityId: string,
  capabilityTitle: string,
  history?: Array<{ speaker: string; text: string }>,
  memoryContext?: string,
  userName?: string,
  userTitle?: string,
  userOrganization?: string,
): Promise<GeminiResponse> {
  const client = getGeminiClient();

  if (!client) {
    throw new Error("Gemini API key is not configured.");
  }

  const identityParts: string[] = [];
  if (userName) identityParts.push(`Name: ${userName}`);
  if (userTitle) identityParts.push(`Title: ${userTitle}`);
  if (userOrganization) identityParts.push(`Organization: ${userOrganization}`);
  const identityBlock = identityParts.length
    ? `\n\n[User identity — use in all documents and records]\n${identityParts.join("\n")}`
    : "";

  const historyBlock =
    history && history.length > 0
      ? `\n\n[Recent conversation]\n${history.map((m) => `${m.speaker === "user" ? "User" : "Chertt"}: ${m.text.slice(0, 400)}`).join("\n")}`
      : "";

  const memoryBlock = memoryContext
    ? `\n\n[Workspace records]\n${memoryContext}`
    : "";

  const contents = `${SYSTEM_PROMPT}${identityBlock}${historyBlock}${memoryBlock}\n\nCapability: ${capabilityId} (${capabilityTitle})\nUser: ${prompt}`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      responseMimeType: "application/json",
      temperature: 0.5,
      maxOutputTokens: 1200,
    },
  });

  const raw = response.text ?? "{}";
  return JSON.parse(raw) as GeminiResponse;
}

function resolveAuthor(context: CommandExecutionContext): string {
  return context.userName?.trim() || "You";
}

function buildDocument(title: string, body: string, type: SmartDocument["type"], author = "You"): SmartDocument {
  return {
    id: createId("doc"),
    title: title || "Untitled document",
    type,
    body,
    status: "pending",
    preparedBy: author,
    awaitingSignatureFrom: "Workspace approver",
    createdAtLabel: "Just now",
  };
}

function buildRequest(opts: {
  title: string;
  description: string;
  amount?: number | null;
  type?: string;
  module?: ModuleKey;
  requester?: string;
}): WorkflowRequest {
  return {
    id: createId("req"),
    type: opts.type || "Expense",
    title: opts.title || "Raised request",
    description: opts.description || "",
    requester: opts.requester || "You",
    amount: opts.amount ?? undefined,
    status: "pending",
    module: opts.module || "toolkit",
    createdAtLabel: "Just now",
    approvalSteps: [
      {
        id: createId("step"),
        label: "Finance review",
        assignee: "Finance Desk",
        dueLabel: "Today",
        completed: false,
      },
      {
        id: createId("step"),
        label: "Executive approval",
        assignee: "Operations Lead",
        dueLabel: "Today",
        completed: false,
      },
    ],
  };
}

function buildPaymentLink(label: string, amount: number): PaymentLink {
  return {
    id: createId("plink"),
    label,
    amount,
    status: "generated",
  };
}

function buildAppointment(title: string, when: string, owner: string): Appointment {
  return {
    id: createId("appt"),
    title: title || "New appointment",
    when: when || "To be scheduled",
    owner: owner || "You",
  };
}

function buildForm(name: string, owner: string): FormDefinition {
  return {
    id: createId("form"),
    name: name || "New internal form",
    submissions: 0,
    owner: owner || "You",
  };
}

function buildInventoryItem(opts: {
  name: string;
  location?: string;
  inStock?: number | null;
  minLevel?: number | null;
}): InventoryItem {
  return {
    id: createId("inv"),
    name: opts.name || "Inventory item",
    location: opts.location || "Main store",
    inStock: typeof opts.inStock === "number" ? Math.max(0, Math.round(opts.inStock)) : 0,
    minLevel: typeof opts.minLevel === "number" ? Math.max(0, Math.round(opts.minLevel)) : 5,
    reserved: 0,
  };
}

function buildIssueReport(opts: {
  title: string;
  area?: string;
  severity?: IssueReport["severity"];
  status?: IssueReport["status"];
  reportedBy?: string;
}): IssueReport {
  return {
    id: createId("issue"),
    title: opts.title || "Facility issue",
    area: opts.area || "Operations floor",
    severity: opts.severity || "medium",
    status: opts.status || "pending",
    mediaCount: 0,
    reportedBy: opts.reportedBy || "You",
  };
}

function buildExpenseEntry(opts: {
  title: string;
  department?: string;
  amount?: number | null;
  status?: ExpenseEntry["status"];
}): ExpenseEntry {
  return {
    id: createId("expense"),
    title: opts.title || "Expense log",
    department: opts.department || "Operations",
    amount: typeof opts.amount === "number" ? opts.amount : 0,
    receiptCount: 0,
    status: opts.status || "pending",
  };
}

function buildPoll(opts: {
  title: string;
  lane?: FeedbackPoll["lane"];
  audience?: string;
  owner?: string;
  questionCount?: number | null;
}): FeedbackPoll {
  return {
    id: createId("poll"),
    title: opts.title || "New feedback poll",
    lane: opts.lane || "pulse",
    audience: opts.audience || "All staff",
    owner: opts.owner || "You",
    questionCount: typeof opts.questionCount === "number" ? Math.max(1, Math.round(opts.questionCount)) : 5,
    responseCount: 0,
    targetCount: 40,
    status: "active",
    updatedAtLabel: "Just now",
  };
}

function buildPerson(opts: {
  name: string;
  title?: string;
  unit?: string;
  phone?: string;
}): Person {
  return {
    id: createId("person"),
    name: opts.name || "Team member",
    title: opts.title || "Team member",
    unit: opts.unit || "Operations",
    phone: opts.phone || "+0000000000",
  };
}

function generateVirtualAccount(churchName: string): string {
  // Deterministic-looking 10-digit NUBAN-style account based on church name + a fixed salt
  let h = 0x811c9dc5;
  for (let i = 0; i < churchName.length; i++) {
    h ^= churchName.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  const p1 = String(h % 100000).padStart(5, "0");
  const p2 = String((h >>> 5) % 100000).padStart(5, "0");
  return `${p1}${p2}`;
}

function buildGivingRecord(opts: {
  churchName: string;
  amount: number;
  givingType?: string;
  donor: string;
}): GivingRecord {
  return {
    id: createId("giving"),
    donor: opts.donor,
    amount: opts.amount,
    channel: "virtual-transfer",
    service: opts.givingType || "giving",
    churchName: opts.churchName,
    virtualAccount: generateVirtualAccount(opts.churchName),
    givingType: opts.givingType || "donation",
    createdAtLabel: "Just now",
  };
}

function buildPermissionDeniedResponse(reason: string): AiCommandResult {
  return normalizeAiCommandResult({
    reply: formatReply(`I could not run that action yet.\n${reason}\nAsk an admin or owner to grant access for this workflow.`),
  });
}

function buildModuleDisabledResponse(module: ModuleKey): AiCommandResult {
  return normalizeAiCommandResult({
    reply: formatReply(
      `That request belongs to the ${module} module, which is not enabled in this workspace yet.\nEnable the module first, then I can execute it by chat.`,
    ),
  });
}

function buildPlannedCapabilityResponse(title: string, module: ModuleKey): AiCommandResult {
  return normalizeAiCommandResult({
    reply: formatReply(
      `${title} is mapped in the ${module} roadmap.\nThe intent is captured, and this action will run through the same command engine as soon as that module is switched from planned to live.`,
    ),
  });
}

function extractAmountFromPrompt(prompt: string) {
  const matches = prompt.match(/\d[\d,]*/g);
  if (!matches?.length) {
    return null;
  }

  const highest = matches
    .map((chunk) => Number(chunk.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];

  return Number.isFinite(highest) ? highest : null;
}

function executeNonToolkitCapability(capabilityId: string, prompt: string): AiCommandResult {
  const amount = extractAmountFromPrompt(prompt);

  switch (capabilityId) {
    case "church.child-checkin":
      return normalizeAiCommandResult({
        reply: formatReply("I have created the Sunday child check-in form.\nYour team can now start check-ins and track attendance."),
        artifact: {
          kind: "form",
          headline: "Child check-in form prepared",
          supportingText: "Check-in flow is ready for children service operations.",
        },
        generatedForm: buildForm("Sunday Child Check-in", "Children Unit"),
      });
    case "church.giving":
      return normalizeAiCommandResult({
        reply: formatReply("I have prepared a giving collection flow.\nThe payment link is ready and can be shared immediately."),
        artifact: {
          kind: "payment-link",
          headline: "Giving link created",
          supportingText: "Church giving can now be tracked in one place.",
        },
        generatedPaymentLink: buildPaymentLink("Church Giving", amount ?? 25000),
      });
    case "church.registration":
      return normalizeAiCommandResult({
        reply: formatReply("I have prepared a church registration form.\nYou can now capture attendees directly in chat-driven workflow."),
        artifact: {
          kind: "form",
          headline: "Church registration form created",
          supportingText: "Conference and service registration can begin now.",
        },
        generatedForm: buildForm("Church Event Registration", "Admin Desk"),
      });
    case "church.first-timer":
      return normalizeAiCommandResult({
        reply: formatReply("I have created a first-timer capture form.\nFollow-up teams can now work from one structured list."),
        artifact: {
          kind: "form",
          headline: "First-timer form created",
          supportingText: "Visitor follow-up details can now be captured and tracked.",
        },
        generatedForm: buildForm("First Timer Capture", "Follow-up Team"),
      });
    case "church.prayer-request":
      return normalizeAiCommandResult({
        reply: formatReply("I have logged that as a prayer request.\nThe pastoral team can now review and follow up."),
        artifact: {
          kind: "request",
          headline: "Prayer request opened",
          supportingText: "Request is now in the church care queue.",
        },
        generatedRequest: buildRequest({
          title: "Prayer request",
          description: prompt,
          type: "Prayer Request",
          module: "church",
          requester: "Chertt AI",
        }),
      });
    case "church.pastoral-care":
      return normalizeAiCommandResult({
        reply: formatReply("I have opened a pastoral care request.\nThe care unit can now track this from assignment to closure."),
        artifact: {
          kind: "request",
          headline: "Pastoral care request opened",
          supportingText: "Care follow-up workflow has been created.",
        },
        generatedRequest: buildRequest({
          title: "Pastoral care request",
          description: prompt,
          type: "Pastoral Care",
          module: "church",
          requester: "Chertt AI",
        }),
      });
    case "store.catalog":
      return normalizeAiCommandResult({
        reply: formatReply("I have prepared a catalog update draft.\nYour team can now review and publish product details."),
        artifact: {
          kind: "document",
          headline: "Catalog draft prepared",
          supportingText: "Catalog update is now documented for release.",
        },
        generatedDocument: buildDocument("Catalog update draft", prompt, "memo"),
      });
    case "store.order-capture":
      return normalizeAiCommandResult({
        reply: formatReply("I have captured this as a store order request.\nIt is now ready for pricing and fulfillment."),
        artifact: {
          kind: "request",
          headline: "Store order captured",
          supportingText: "Order can now move into fulfillment workflow.",
        },
        generatedRequest: buildRequest({
          title: "Store order capture",
          description: prompt,
          type: "Store Order",
          module: "store",
        }),
      });
    case "store.invoicing-receipts":
      return normalizeAiCommandResult({
        reply: formatReply("I have prepared the invoice.\nIt is now ready to issue to the customer."),
        artifact: {
          kind: "document",
          headline: "Store invoice prepared",
          supportingText: "Invoice is ready for customer delivery.",
        },
        generatedDocument: buildDocument("Store invoice", "Invoice prepared from your order details.", "invoice"),
      });
    case "store.payment-collection":
      return normalizeAiCommandResult({
        reply: formatReply("I have generated the payment collection link.\nYou can now share it with the customer."),
        artifact: {
          kind: "payment-link",
          headline: "Payment link generated",
          supportingText: "Collection step is now active.",
        },
        generatedPaymentLink: buildPaymentLink("Store payment", amount ?? 50000),
      });
    case "store.stock-tracking":
      return normalizeAiCommandResult({
        reply: formatReply("I have logged a stock-tracking task.\nThe store manager can now update quantities and monitor availability."),
        artifact: {
          kind: "request",
          headline: "Stock tracking task created",
          supportingText: "Stock update flow has been added to operations queue.",
        },
        generatedRequest: buildRequest({
          title: "Stock tracking update",
          description: prompt,
          type: "Stock Tracking",
          module: "store",
        }),
      });
    case "store.order-management":
      return normalizeAiCommandResult({
        reply: formatReply("I have opened an order management workflow.\nDelivery code and customer status can now be tracked."),
        artifact: {
          kind: "request",
          headline: "Order workflow opened",
          supportingText: "Order management flow is ready.",
        },
        generatedRequest: buildRequest({
          title: "Order management task",
          description: prompt,
          type: "Order Management",
          module: "store",
        }),
      });
    case "events.registration":
      return normalizeAiCommandResult({
        reply: formatReply("I have created an event registration form.\nGuests can now register and receive updates."),
        artifact: {
          kind: "form",
          headline: "Event registration form created",
          supportingText: "Registration flow is now active.",
        },
        generatedForm: buildForm("Event Registration", "Events Desk"),
      });
    case "events.ticketing":
      return normalizeAiCommandResult({
        reply: formatReply("I have opened a ticketing workflow.\nYou can now issue paid or free tickets from this queue."),
        artifact: {
          kind: "request",
          headline: "Ticketing workflow opened",
          supportingText: "Ticket issuance process is now ready.",
        },
        generatedRequest: buildRequest({
          title: "Ticketing request",
          description: prompt,
          type: "Ticketing",
          module: "events",
        }),
      });
    case "events.invites-reminders":
      return normalizeAiCommandResult({
        reply: formatReply("I have opened an invitation and reminders workflow.\nGuest communication can now be scheduled."),
        artifact: {
          kind: "request",
          headline: "Invitation flow opened",
          supportingText: "Invites and reminder messaging are ready to run.",
        },
        generatedRequest: buildRequest({
          title: "Invitation and reminder flow",
          description: prompt,
          type: "Invitations",
          module: "events",
        }),
      });
    case "events.rsvp-management":
      return normalizeAiCommandResult({
        reply: formatReply("I have opened an RSVP management workflow.\nGuest responses can now be tracked and updated."),
        artifact: {
          kind: "request",
          headline: "RSVP workflow opened",
          supportingText: "RSVP tracking is ready for event operations.",
        },
        generatedRequest: buildRequest({
          title: "RSVP management",
          description: prompt,
          type: "RSVP",
          module: "events",
        }),
      });
    case "events.guest-checkin":
      return normalizeAiCommandResult({
        reply: formatReply("I have opened a guest check-in workflow.\nAccess control and check-in operations can now begin."),
        artifact: {
          kind: "request",
          headline: "Guest check-in flow opened",
          supportingText: "Check-in and access workflow is now prepared.",
        },
        generatedRequest: buildRequest({
          title: "Guest check-in flow",
          description: prompt,
          type: "Guest Check-in",
          module: "events",
        }),
      });
    default:
      return normalizeAiCommandResult({
        reply: formatReply("I have captured that request.\nThe module workflow can now continue in structured steps."),
      });
  }
}

function fallbackCommand(prompt: string, forcedCapabilityId?: string, context: CommandExecutionContext = {}): AiCommandResult {
  const author = resolveAuthor(context);
  const normalized = prompt.toLowerCase();
  const forcedCapability = forcedCapabilityId ? getCapabilityById(forcedCapabilityId) : null;
  const wantsWrittenReport =
    normalized.includes("draft a report") ||
    normalized.includes("write a report") ||
    normalized.includes("prepare a report") ||
    normalized.includes("incident report") ||
    normalized.includes("weekly report") ||
    normalized.includes("summary report");

  const wantsInventory =
    normalized.includes("inventory") ||
    normalized.includes("stock") ||
    normalized.includes("reorder") ||
    normalized.includes("store item");
  const wantsIssue =
    normalized.includes("issue") ||
    normalized.includes("repair") ||
    normalized.includes("broken") ||
    normalized.includes("facility") ||
    normalized.includes("incident");
  const wantsExpenseLog =
    normalized.includes("expense log") ||
    normalized.includes("log expense") ||
    normalized.includes("petty cash") ||
    normalized.includes("receipt");
  const wantsPoll =
    normalized.includes("poll") ||
    normalized.includes("survey") ||
    normalized.includes("feedback form") ||
    normalized.includes("feedback poll");
  const wantsDirectoryEntry =
    normalized.includes("add staff") ||
    normalized.includes("new staff") ||
    normalized.includes("staff directory") ||
    normalized.includes("add to directory");

  if (forcedCapability?.status === "planned") {
    return buildPlannedCapabilityResponse(forcedCapability.title, forcedCapability.module);
  }

  if (forcedCapability) {
    switch (forcedCapability.id) {
      case "toolkit.inventory-management":
        return normalizeAiCommandResult({
          reply: formatReply("I have added that inventory item.\nStore levels are now ready for tracking and reorder alerts."),
          artifact: {
            kind: "inventory",
            headline: "Inventory item added",
            supportingText: "The item is now part of inventory monitoring.",
          },
          generatedInventoryItem: buildInventoryItem({
            name: "Office supply item",
            location: "Main store",
            inStock: 24,
            minLevel: 8,
          }),
        });
      case "toolkit.issue-reporting":
        return normalizeAiCommandResult({
          reply: formatReply("I have logged that as a facility issue.\nThe team can now track it from report to resolution."),
          artifact: {
            kind: "issue",
            headline: "Issue report opened",
            supportingText: "The maintenance problem now lives as a structured work item.",
          },
          generatedIssueReport: buildIssueReport({
            title: "Facility issue report",
            area: "Operations floor",
            severity: "high",
            status: "pending",
            reportedBy: author,
          }),
        });
      case "toolkit.expense-logging":
        return normalizeAiCommandResult({
          reply: formatReply("I have logged that as an expense entry.\nAccounts can now track it in the expense ledger."),
          artifact: {
            kind: "expense-log",
            headline: "Expense entry logged",
            supportingText: "The expense is now captured for reconciliation and reporting.",
          },
          generatedExpenseEntry: buildExpenseEntry({
            title: "Operational expense log",
            department: "Operations",
            amount: 85000,
            status: "pending",
          }),
        });
      case "toolkit.polls-feedback":
        return normalizeAiCommandResult({
          reply: formatReply("I have prepared the poll.\nResponses can now start coming into the feedback lane."),
          artifact: {
            kind: "poll",
            headline: "Feedback poll created",
            supportingText: "The poll is active and ready for staff responses.",
          },
          generatedPoll: buildPoll({
            title: "Weekly operations pulse",
            lane: "pulse",
            audience: "All staff",
            owner: "Operations",
            questionCount: 6,
          }),
        });
      case "toolkit.staff-directory":
        return normalizeAiCommandResult({
          reply: formatReply("I have added that team member to the directory.\nThe profile is now available for quick lookup."),
          artifact: {
            kind: "directory",
            headline: "Directory profile added",
            supportingText: "Staff details can now be searched and referenced.",
          },
          generatedPerson: buildPerson({
            name: "New team member",
            title: "Team member",
            unit: "Operations",
            phone: "+0000000000",
          }),
        });
      case "toolkit.simple-forms":
        return normalizeAiCommandResult({
          reply: formatReply("I have prepared a simple internal form.\nYour team can start collecting responses right away."),
          artifact: {
            kind: "form",
            headline: "Form scaffold prepared",
            supportingText: "The form is ready to live inside the Toolkit forms area.",
          },
          generatedForm: buildForm("Internal request form", "Operations"),
        });
      case "toolkit.appointments":
        return normalizeAiCommandResult({
          reply: formatReply("I have prepared the appointment.\nIt is now ready in the Toolkit scheduling flow."),
          artifact: {
            kind: "appointment",
            headline: "Appointment scheduled",
            supportingText: "The meeting is ready to be tracked alongside other operational follow-up.",
          },
          generatedAppointment: buildAppointment("Vendor document sign-off", "Tomorrow, 10:00 AM", author),
        });
      case "toolkit.requests-approvals":
        return normalizeAiCommandResult({
          reply: formatReply("I have raised that as an expense approval.\nIt is now in the Business Toolkit work queue and ready for review."),
          artifact: {
            kind: "request",
            headline: "Expense request opened",
            supportingText: "The request is now a trackable approval item with owners and status.",
          },
          generatedRequest: buildRequest({
            title: "Operational expense request",
            description: prompt,
            amount: 85000,
            type: "Expense",
          }),
        });
      case "toolkit.process-recall":
      case "toolkit.faq":
      case "toolkit.staff-onboarding":
        return normalizeAiCommandResult({
          reply: formatReply("I found the closest operational guidance.\nYou can move from lookup to action without leaving Business Toolkit."),
          artifact: {
            kind: "document",
            headline: "Knowledge recall prepared",
            supportingText: "Process guidance is now available without leaving the module.",
          },
        });
      case "toolkit.smart-documents":
      default:
        break;
    }
  }

  if (wantsExpenseLog && !normalized.includes("request")) {
    return normalizeAiCommandResult({
      reply: formatReply("I have logged that as an expense entry.\nAccounts can now track it in the expense ledger."),
      artifact: {
        kind: "expense-log",
        headline: "Expense entry logged",
        supportingText: "The expense is now captured for reconciliation and reporting.",
      },
      generatedExpenseEntry: buildExpenseEntry({
        title: "Operational expense log",
        department: "Operations",
        amount: 85000,
        status: "pending",
      }),
    });
  }

  if (normalized.includes("expense") || normalized.includes("fuel") || normalized.includes("diesel")) {
    return normalizeAiCommandResult({
      reply: formatReply("I have raised that as an expense approval.\nIt is now in the Business Toolkit work queue and ready for review."),
      artifact: {
        kind: "request",
        headline: "Expense request opened",
        supportingText: "The request is now a trackable approval item with owners and status.",
      },
      generatedRequest: buildRequest({
        title: "Operational expense request",
        description: prompt,
        amount: 85000,
        type: "Expense",
      }),
    });
  }

  if (wantsInventory) {
    return normalizeAiCommandResult({
      reply: formatReply("I have added that inventory item.\nStore levels are now ready for tracking and reorder alerts."),
      artifact: {
        kind: "inventory",
        headline: "Inventory item added",
        supportingText: "The item is now part of inventory monitoring.",
      },
      generatedInventoryItem: buildInventoryItem({
        name: "Office supply item",
        location: "Main store",
        inStock: 24,
        minLevel: 8,
      }),
    });
  }

  if (wantsIssue) {
    return normalizeAiCommandResult({
      reply: formatReply("I have logged that as a facility issue.\nThe team can now track it from report to resolution."),
      artifact: {
        kind: "issue",
        headline: "Issue report opened",
        supportingText: "The maintenance problem now lives as a structured work item.",
      },
      generatedIssueReport: buildIssueReport({
        title: "Facility issue report",
        area: "Operations floor",
        severity: "high",
        status: "pending",
        reportedBy: author,
      }),
    });
  }

  if (wantsWrittenReport) {
    const memo = buildFallbackMemoDraft(prompt);
    return normalizeAiCommandResult({
      reply: formatReply("I have drafted the report.\nIt is ready in Smart Documents for review and editing."),
      artifact: {
        kind: "document",
        headline: "Report draft prepared",
        supportingText: "The written report is now ready for review and routing.",
      },
      generatedDocument: buildDocument(memo.title, memo.body, "memo", author),
    });
  }

  if (normalized.includes("invoice") || normalized.includes("payment link")) {
    return normalizeAiCommandResult({
      reply: formatReply("I have prepared the invoice flow.\nThe payment link is ready for collection follow-through."),
      artifact: {
        kind: "payment-link",
        headline: "Payment link ready",
        supportingText: "The collection step is now ready inside the workflow.",
      },
      generatedDocument: buildDocument(
        "Customer invoice",
        "Please find the invoice attached. Payment can be completed through the generated payment link.",
        "invoice",
      ),
      generatedPaymentLink: buildPaymentLink("Customer invoice", 128000),
    });
  }

  if (normalized.includes("appointment") || normalized.includes("meeting") || normalized.includes("schedule")) {
    return normalizeAiCommandResult({
      reply: formatReply("I have prepared the appointment.\nIt is now ready in the Toolkit scheduling flow."),
      artifact: {
        kind: "appointment",
        headline: "Appointment scheduled",
        supportingText: "The meeting is ready to be tracked alongside other operational follow-up.",
      },
      generatedAppointment: buildAppointment("Vendor document sign-off", "Tomorrow, 10:00 AM", author),
    });
  }

  if (normalized.includes("form")) {
    return normalizeAiCommandResult({
      reply: formatReply("I have prepared a simple internal form.\nYour team can start collecting responses right away."),
      artifact: {
        kind: "form",
        headline: "Form scaffold prepared",
        supportingText: "The form is ready to live inside the Toolkit forms area.",
      },
      generatedForm: buildForm("Internal request form", "Operations"),
    });
  }

  if (wantsPoll) {
    return normalizeAiCommandResult({
      reply: formatReply("I have prepared the poll.\nResponses can now start coming into the feedback lane."),
      artifact: {
        kind: "poll",
        headline: "Feedback poll created",
        supportingText: "The poll is active and ready for staff responses.",
      },
      generatedPoll: buildPoll({
        title: "Weekly operations pulse",
        lane: "pulse",
        audience: "All staff",
        owner: "Operations",
        questionCount: 6,
      }),
    });
  }

  if (wantsDirectoryEntry) {
    return normalizeAiCommandResult({
      reply: formatReply("I have added that team member to the directory.\nThe profile is now available for quick lookup."),
      artifact: {
        kind: "directory",
        headline: "Directory profile added",
        supportingText: "Staff details can now be searched and referenced.",
      },
      generatedPerson: buildPerson({
        name: "New team member",
        title: "Team member",
        unit: "Operations",
        phone: "+0000000000",
      }),
    });
  }

  if (normalized.includes("process") || normalized.includes("faq") || normalized.includes("policy") || normalized.includes("directory") || normalized.includes("staff")) {
    return normalizeAiCommandResult({
      reply: formatReply("I found the closest operational guidance.\nYou can move from lookup to action without leaving Business Toolkit."),
      artifact: {
        kind: "document",
        headline: "Knowledge recall prepared",
        supportingText: "Process guidance is now available without leaving the module.",
      },
    });
  }

  const letter = buildFallbackLetterDraft(prompt, author);
  return normalizeAiCommandResult({
    reply: formatReply("I have drafted the document.\nIt is staged in Smart Documents for review and signature routing."),
    artifact: {
      kind: "document",
      headline: "Draft prepared",
      supportingText: "The document is ready for authorization and next-step handling.",
    },
    generatedDocument: buildDocument(letter.title, letter.body, "letter", author),
  });
}

// Capabilities that produce a formal output requiring user confirmation before execution
const CONFIRMATION_REQUIRED_ARTIFACT_KINDS = new Set(["document", "payment-link"]);

function buildConfirmationResponse(
  artifactKind: string,
  title: string,
  docType?: string,
): AiCommandResult {
  const kindLabel = artifactKind === "payment-link" ? "payment link"
    : artifactKind === "request" ? "request"
    : artifactKind === "giving" ? "payment"
    : docType || "document";
  const summary = `Confirm ${kindLabel}: "${title}"`;
  return normalizeAiCommandResult({
    reply: `I'm ready to create this — confirm to proceed.\n\n**${title}**`,
    pendingConfirmation: {
      summary,
      actionKey: artifactKind,
      previewTitle: title,
    },
  });
}

export async function runCherttCommand(
  prompt: string,
  context: CommandExecutionContext = {},
  confirmed = false,
): Promise<AiCommandResult> {
  const intent = resolveCapabilityIntent(prompt);
  const capability = intent.capability;
  const role = context.role ?? "owner";
  const access = evaluateCapabilityAccess(capability.id, role);

  if (!access.allowed) {
    return buildPermissionDeniedResponse(access.reason);
  }

  if (capability.status === "planned") {
    return buildPlannedCapabilityResponse(capability.title, capability.module);
  }

  const client = getGeminiClient();

  if (!client) {
    return fallbackCommand(prompt, capability.id, context);
  }

  try {
    const gemini = await callGemini(prompt, capability.id, capability.title, context.history, context.memoryContext, context.userName, context.userTitle, context.userOrganization);

    const author = resolveAuthor(context);

    // Gate document and payment-link creation behind a confirmation step
    if (!confirmed && CONFIRMATION_REQUIRED_ARTIFACT_KINDS.has(gemini.artifactKind)) {
      const previewTitle =
        gemini.artifactKind === "payment-link"
          ? gemini.artifactHeadline || "Payment link"
          : gemini.documentTitle || gemini.artifactHeadline || "Document";
      return buildConfirmationResponse(gemini.artifactKind, previewTitle, gemini.documentType || undefined);
    }

    // Gate high-amount requests behind a confirmation step
    if (!confirmed && gemini.artifactKind === "request" && typeof gemini.requestAmount === "number" && gemini.requestAmount >= 50000) {
      return buildConfirmationResponse("request", gemini.requestTitle || "Request", gemini.requestType || undefined);
    }

    // Gate giving/church payments behind a confirmation step
    if (!confirmed && gemini.artifactKind === "giving" && gemini.givingChurchName && gemini.givingAmount) {
      const label = `${gemini.givingType || "Giving"} to ${gemini.givingChurchName}`;
      return buildConfirmationResponse("giving", label);
    }

    const result: AiCommandResult = {
      reply: formatReply(gemini.reply || "Done. Here's the next step."),
    };

    if (gemini.artifactKind !== "none" && gemini.artifactHeadline) {
      result.artifact = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kind: gemini.artifactKind as any,
        headline: gemini.artifactHeadline,
        supportingText: gemini.artifactDetail || "",
      };
    }

    if (gemini.artifactKind === "document" && gemini.documentTitle) {
      result.generatedDocument = buildDocument(
        gemini.documentTitle,
        gemini.documentBody || "Document content is being prepared.",
        (gemini.documentType as SmartDocument["type"]) || "letter",
        author,
      );
    }

    if (gemini.artifactKind === "request" && gemini.requestTitle) {
      result.generatedRequest = buildRequest({
        title: gemini.requestTitle,
        description: gemini.requestDescription,
        amount: gemini.requestAmount,
        type: gemini.requestType || "Expense",
        requester: author,
      });
    }

    if (gemini.artifactKind === "payment-link" && gemini.requestAmount) {
      result.generatedDocument = buildDocument(
        gemini.documentTitle || "Invoice",
        gemini.documentBody || "Invoice prepared for payment collection.",
        "invoice",
        author,
      );
      result.generatedPaymentLink = buildPaymentLink(
        gemini.artifactHeadline || "Payment link",
        gemini.requestAmount,
      );
    }

    if (gemini.artifactKind === "appointment" && gemini.appointmentTitle) {
      result.generatedAppointment = buildAppointment(
        gemini.appointmentTitle,
        gemini.appointmentWhen,
        gemini.appointmentOwner || author,
      );
    }

    if (gemini.artifactKind === "form" && gemini.formName) {
      result.generatedForm = buildForm(gemini.formName, gemini.formOwner || author);
    }

    if (gemini.artifactKind === "inventory" && gemini.inventoryItemName) {
      result.generatedInventoryItem = buildInventoryItem({
        name: gemini.inventoryItemName,
        location: gemini.inventoryLocation,
        inStock: gemini.inventoryInStock,
        minLevel: gemini.inventoryMinLevel,
      });
    }

    if (gemini.artifactKind === "issue" && gemini.issueTitle) {
      result.generatedIssueReport = buildIssueReport({
        title: gemini.issueTitle,
        area: gemini.issueArea,
        severity: (gemini.issueSeverity as IssueReport["severity"]) || "medium",
        status: (gemini.issueStatus as IssueReport["status"]) || "pending",
        reportedBy: gemini.issueReportedBy || author,
      });
    }

    if (gemini.artifactKind === "expense-log" && gemini.expenseTitle) {
      result.generatedExpenseEntry = buildExpenseEntry({
        title: gemini.expenseTitle,
        department: gemini.expenseDepartment,
        amount: gemini.expenseAmount,
        status: (gemini.expenseStatus as ExpenseEntry["status"]) || "pending",
      });
    }

    if (gemini.artifactKind === "poll" && gemini.pollTitle) {
      result.generatedPoll = buildPoll({
        title: gemini.pollTitle,
        lane: (gemini.pollLane as FeedbackPoll["lane"]) || "pulse",
        audience: gemini.pollAudience,
        owner: gemini.pollOwner || author,
        questionCount: gemini.pollQuestionCount,
      });
    }

    if (gemini.artifactKind === "directory" && gemini.directoryName) {
      result.generatedPerson = buildPerson({
        name: gemini.directoryName,
        title: gemini.directoryTitle,
        unit: gemini.directoryUnit,
        phone: gemini.directoryPhone,
      });
    }

    if (gemini.artifactKind === "giving" && gemini.givingChurchName && gemini.givingAmount) {
      result.generatedGivingRecord = buildGivingRecord({
        churchName: gemini.givingChurchName,
        amount: gemini.givingAmount,
        givingType: gemini.givingType || "donation",
        donor: author,
      });
    }

    return normalizeAiCommandResult(result);
  } catch (error) {
    console.error("Gemini command fallback:", error);
    return fallbackCommand(prompt, capability.id, context);
  }
}
