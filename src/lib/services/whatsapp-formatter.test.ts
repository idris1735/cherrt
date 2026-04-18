import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatAiResult } from "@/lib/services/whatsapp-formatter";
import type { AiCommandResult } from "@/lib/types";

const APP_URL = "https://chertt.test";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("formatAiResult", () => {
  it("formats pending confirmation", () => {
    const result: AiCommandResult = {
      reply: "",
      pendingConfirmation: {
        summary: "Create a letter",
        actionKey: "document",
        previewTitle: "Payment Extension Request",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Payment Extension Request");
    expect(text).toContain("CONFIRM");
    expect(text).toContain("CANCEL");
  });

  it("formats generated document with signing link", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedDocument: {
        id: "doc-1",
        title: "Fuel Vendor Letter",
        type: "letter",
        body: "Dear vendor...",
        status: "pending",
        preparedBy: "Guest",
        awaitingSignatureFrom: "Admin",
        createdAtLabel: "Today",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Fuel Vendor Letter");
    expect(text).toContain("Admin");
    expect(text).toContain(`${APP_URL}/w/global-hub/chat`);
  });

  it("formats generated expense entry", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedExpenseEntry: {
        id: "exp-1",
        title: "Fuel purchase",
        department: "Operations",
        amount: 15000,
        receiptCount: 0,
        status: "pending",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("15,000");
  });

  it("strips markdown from plain text replies", () => {
    const result: AiCommandResult = {
      reply: "**Hello** this is a *reply*\n## Headers\n- item one\n- item two",
    };
    const { text } = formatAiResult(result);
    expect(text).not.toContain("**");
    expect(text).not.toContain("*reply*");
    expect(text).toContain("Hello");
    expect(text).toContain("• item one");
    // Headers at line start should be stripped
    expect(text).not.toContain("## Headers");
  });

  it("returns fallback for empty result", () => {
    const result: AiCommandResult = { reply: "" };
    const { text } = formatAiResult(result);
    expect(text).toContain("Something went wrong");
  });

  it("formats generated request", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedRequest: {
        id: "req-1",
        title: "Diesel supply request",
        type: "supply",
        status: "pending",
        requester: "Guest",
        amount: 50000,
        description: "Request for diesel",
        module: "toolkit",
        createdAtLabel: "Today",
        approvalSteps: [],
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Diesel supply request");
    expect(text).toContain("50,000");
  });

  it("formats generated issue report", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedIssueReport: {
        id: "issue-1",
        title: "AC broken in main hall",
        area: "Main Hall",
        severity: "high",
        status: "pending",
        reportedBy: "Guest",
        mediaCount: 0,
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("AC broken in main hall");
    expect(text).toContain("notified");
  });

  it("formats generated inventory item", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedInventoryItem: {
        id: "item-1",
        name: "Generator Diesel",
        location: "Store",
        inStock: 45,
        minLevel: 10,
        reserved: 0,
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Generator Diesel");
    expect(text).toContain("45");
  });

  it("formats generated poll", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedPoll: {
        id: "poll-1",
        title: "Office hours preference",
        lane: "pulse",
        audience: "all",
        owner: "Guest",
        questionCount: 1,
        responseCount: 0,
        targetCount: 50,
        status: "active",
        updatedAtLabel: "Today",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Office hours preference");
  });

  it("formats generated appointment", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedAppointment: {
        id: "apt-1",
        title: "Board meeting",
        when: "Monday 10am",
        owner: "Guest",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Board meeting");
    expect(text).toContain("Monday 10am");
  });

  it("formats generated payment link", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedPaymentLink: {
        id: "link-1",
        label: "Invoice #001",
        amount: 25000,
        status: "generated",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Payment link ready");
  });

  it("formats generated person", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedPerson: {
        id: "person-1",
        name: "John Doe",
        title: "Finance Manager",
        unit: "Finance",
        phone: "+234701234567",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("John Doe");
    expect(text).toContain("Finance Manager");
    expect(text).toContain("+234701234567");
  });

  it("formats generated giving record", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedGivingRecord: {
        id: "giving-1",
        donor: "Alice Smith",
        amount: 10000,
        channel: "bank_transfer",
        service: "Sunday Service",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Giving recorded");
    expect(text).toContain("10,000");
    expect(text).toContain("Alice Smith");
  });

  it("formats generated form", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedForm: {
        id: "form-1",
        name: "Volunteer Registration",
        submissions: 0,
        owner: "Guest",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Volunteer Registration");
    expect(text).toContain(`${APP_URL}/w/global-hub/chat`);
  });

  it("formats generated request without amount", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedRequest: {
        id: "req-2",
        title: "Office supplies",
        type: "supply",
        status: "pending",
        requester: "Guest",
        description: "Request for office supplies",
        module: "toolkit",
        createdAtLabel: "Today",
        approvalSteps: [],
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Office supplies");
    expect(text).not.toContain("₦");
  });

  it("formats generated document without routing", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedDocument: {
        id: "doc-2",
        title: "Invoice #2024-001",
        type: "invoice",
        body: "Invoice details...",
        status: "pending",
        preparedBy: "Guest",
        createdAtLabel: "Today",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Invoice #2024-001");
    expect(text).not.toContain("Routed");
  });
});
