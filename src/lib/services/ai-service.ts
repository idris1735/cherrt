import { GoogleGenAI } from "@google/genai";

import type {
  AiCommandResult,
  Appointment,
  FormDefinition,
  PaymentLink,
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
  artifactKind: "document" | "request" | "payment-link" | "appointment" | "form" | "none";
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
};

const SYSTEM_PROMPT = `You are Chertt AI inside the Business Toolkit module of Chertt, a chat-first operations app for organizations.

Role:
- You are an operational AI assistant for internal business work.
- You think like an operations lead, admin desk, facilities coordinator, finance coordinator, and executive assistant combined.
- You do not answer like a generic chatbot. You answer like someone helping a real organization move work forward.

Business Toolkit scope:
- smart documents with approval and signature routing
- requests and approvals for expense, supply, repair, and admin work
- inventory and stock checks
- issue and facility reporting
- petty cash and expense logging
- simple forms
- appointments and scheduling
- FAQs, process notes, and internal operations memory
- staff onboarding and staff directory lookups

Product behavior:
- Chat-first means the user may speak naturally and casually.
- When possible, translate messy requests into clean structured work.
- If the user asks for something incomplete, make a sensible first draft instead of refusing.
- Only ask for missing details when they are truly necessary.
- Prefer practical next steps over abstract advice.
- Do not use time-based greetings like good morning, good afternoon, or good evening unless the user uses them first.
- Do not sound like a generic chatbot or personal assistant.
- Avoid filler lines like "How can I help you today?" or "I'm here to help."
- Lead with the work: what you understood, what you created, or what the next operational step is.

Return valid JSON only. No markdown. No code fences. No commentary outside JSON.

Use this exact shape:
{
  "reply": "short direct response",
  "artifactKind": "document" | "request" | "payment-link" | "appointment" | "form" | "none",
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
  "appointmentWhen": "string",
  "appointmentOwner": "string",
  "formName": "string",
  "formOwner": "string"
}

Rules:
- Drafting letters, memos, invoices -> artifactKind "document"
- If the user asks to draft or write a report, summary, memo, or formal note, prefer artifactKind "document" with documentType "memo" unless they are clearly reporting a live operational issue.
- Expense, repairs, approvals, supplies, issues -> artifactKind "request"
- If the user says "report" and they are describing a broken item, facility problem, incident, or operational fault, treat it as a request.
- Payment links and invoice collection -> artifactKind "payment-link"
- Scheduling meetings or visits -> artifactKind "appointment"
- Creating internal forms -> artifactKind "form"
- Directory lookup, FAQ, or process recall without creating a new record -> artifactKind "none"
- Keep the reply warm, concise, and product-aware.
- The reply should read well inside a mobile chat bubble.
- Use 1 to 4 short paragraphs or short lines, not one long block.
- Plain text only. No markdown bullets, no numbering, no code fences.
- Keep the tone calm, capable, and operational.
- If you create a record, say what you created and what happens next.
- If you recall knowledge, give the answer directly and include the most useful next action.
- If you draft a document body, make it polished, professional, and ready for review.
- Prefer Business Toolkit use cases only.`;

function formatReply(reply: string) {
  return reply
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new GoogleGenAI({ apiKey });
}

async function callGemini(prompt: string): Promise<GeminiResponse> {
  const client = getGeminiClient();

  if (!client) {
    throw new Error("Gemini API key is not configured.");
  }

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `${SYSTEM_PROMPT}\n\nUser request: ${prompt}`,
    config: {
      responseMimeType: "application/json",
      temperature: 0.5,
      maxOutputTokens: 1024,
    },
  });

  const raw = response.text ?? "{}";
  return JSON.parse(raw) as GeminiResponse;
}

function buildDocument(title: string, body: string, type: SmartDocument["type"]): SmartDocument {
  return {
    id: createId("doc"),
    title: title || "Untitled document",
    type,
    body,
    status: "pending",
    preparedBy: "Chertt AI",
    awaitingSignatureFrom: "Workspace approver",
    createdAtLabel: "Just now",
  };
}

function buildRequest(opts: {
  title: string;
  description: string;
  amount?: number | null;
  type?: string;
}): WorkflowRequest {
  return {
    id: createId("req"),
    type: opts.type || "Expense",
    title: opts.title || "AI-raised request",
    description: opts.description || "",
    requester: "Chertt AI",
    amount: opts.amount ?? undefined,
    status: "pending",
    module: "toolkit",
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
    owner: owner || "Chertt AI",
  };
}

function buildForm(name: string, owner: string): FormDefinition {
  return {
    id: createId("form"),
    name: name || "New internal form",
    submissions: 0,
    owner: owner || "Chertt AI",
  };
}

function fallbackCommand(prompt: string): AiCommandResult {
  const normalized = prompt.toLowerCase();
  const wantsWrittenReport =
    normalized.includes("draft a report") ||
    normalized.includes("write a report") ||
    normalized.includes("prepare a report") ||
    normalized.includes("incident report") ||
    normalized.includes("weekly report") ||
    normalized.includes("summary report");

  if (normalized.includes("expense") || normalized.includes("fuel") || normalized.includes("diesel") || normalized.includes("petty cash")) {
    return {
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
    };
  }

  if (normalized.includes("issue") || normalized.includes("repair") || normalized.includes("broken") || normalized.includes("ac") || normalized.includes("facility")) {
    return {
      reply: formatReply("I have logged that as a facility issue.\nThe team can now track it from report to resolution."),
      artifact: {
        kind: "request",
        headline: "Issue report opened",
        supportingText: "The maintenance problem now lives as a structured work item.",
      },
      generatedRequest: buildRequest({
        title: "Facility issue report",
        description: prompt,
        type: "Maintenance",
      }),
    };
  }

  if (wantsWrittenReport) {
    return {
      reply: formatReply("I have drafted the report.\nIt is ready in Smart Documents for review and editing."),
      artifact: {
        kind: "document",
        headline: "Report draft prepared",
        supportingText: "The written report is now ready for review and routing.",
      },
      generatedDocument: buildDocument(
        "Operational report",
        `Report Summary\n\n${prompt}\n\nPrepared for internal review by Chertt AI.`,
        "memo",
      ),
    };
  }

  if (normalized.includes("invoice") || normalized.includes("payment link")) {
    return {
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
    };
  }

  if (normalized.includes("appointment") || normalized.includes("meeting") || normalized.includes("schedule")) {
    return {
      reply: formatReply("I have prepared the appointment.\nIt is now ready in the Toolkit scheduling flow."),
      artifact: {
        kind: "appointment",
        headline: "Appointment scheduled",
        supportingText: "The meeting is ready to be tracked alongside other operational follow-up.",
      },
      generatedAppointment: buildAppointment("Vendor document sign-off", "Tomorrow, 10:00 AM", "Chertt AI"),
    };
  }

  if (normalized.includes("form")) {
    return {
      reply: formatReply("I have prepared a simple internal form.\nYour team can start collecting responses right away."),
      artifact: {
        kind: "form",
        headline: "Form scaffold prepared",
        supportingText: "The form is ready to live inside the Toolkit forms area.",
      },
      generatedForm: buildForm("Internal request form", "Operations"),
    };
  }

  if (normalized.includes("process") || normalized.includes("faq") || normalized.includes("policy") || normalized.includes("directory") || normalized.includes("staff")) {
    return {
      reply: formatReply("I found the closest operational guidance.\nYou can move from lookup to action without leaving Business Toolkit."),
      artifact: {
        kind: "document",
        headline: "Knowledge recall prepared",
        supportingText: "Process guidance is now available without leaving the module.",
      },
    };
  }

  return {
    reply: formatReply("I have drafted the document.\nIt is staged in Smart Documents for review and signature routing."),
    artifact: {
      kind: "document",
      headline: "Draft prepared",
      supportingText: "The document is ready for authorization and next-step handling.",
    },
    generatedDocument: buildDocument(
      "Letter of organizational intent",
      `Dear Team,\n\n${prompt}\n\nWarm regards,\nChertt AI`,
      "letter",
    ),
  };
}

export async function runCherttCommand(prompt: string): Promise<AiCommandResult> {
  const client = getGeminiClient();

  if (!client) {
    return fallbackCommand(prompt);
  }

  try {
    const gemini = await callGemini(prompt);
    const result: AiCommandResult = {
      reply: formatReply(gemini.reply || "Done.\nI have prepared the next operational step for you."),
    };

    if (gemini.artifactKind !== "none" && gemini.artifactHeadline) {
      result.artifact = {
        kind: gemini.artifactKind,
        headline: gemini.artifactHeadline,
        supportingText: gemini.artifactDetail || "",
      };
    }

    if (gemini.artifactKind === "document" && gemini.documentTitle) {
      result.generatedDocument = buildDocument(
        gemini.documentTitle,
        gemini.documentBody || "Document content prepared by Chertt AI.",
        (gemini.documentType as SmartDocument["type"]) || "letter",
      );
    }

    if (gemini.artifactKind === "request" && gemini.requestTitle) {
      result.generatedRequest = buildRequest({
        title: gemini.requestTitle,
        description: gemini.requestDescription,
        amount: gemini.requestAmount,
        type: gemini.requestType || "Expense",
      });
    }

    if (gemini.artifactKind === "payment-link") {
      result.generatedDocument = buildDocument(
        gemini.documentTitle || "Customer invoice",
        gemini.documentBody || "Invoice prepared for payment collection.",
        "invoice",
      );
      result.generatedPaymentLink = buildPaymentLink(
        gemini.artifactHeadline || "Payment link",
        gemini.requestAmount ?? 128000,
      );
    }

    if (gemini.artifactKind === "appointment" && gemini.appointmentTitle) {
      result.generatedAppointment = buildAppointment(
        gemini.appointmentTitle,
        gemini.appointmentWhen,
        gemini.appointmentOwner,
      );
    }

    if (gemini.artifactKind === "form" && gemini.formName) {
      result.generatedForm = buildForm(gemini.formName, gemini.formOwner);
    }

    return result;
  } catch (error) {
    console.error("Gemini command fallback:", error);
    return fallbackCommand(prompt);
  }
}
