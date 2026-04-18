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
      reply: "**Hello** this is a *reply* with ## headers\n- item one\n- item two",
    };
    const { text } = formatAiResult(result);
    expect(text).not.toContain("**");
    expect(text).not.toContain("##");
    expect(text).toContain("Hello");
    expect(text).toContain("• item one");
  });

  it("returns fallback for empty result", () => {
    const result: AiCommandResult = { reply: "" };
    const { text } = formatAiResult(result);
    expect(text).toContain("Something went wrong");
  });
});
