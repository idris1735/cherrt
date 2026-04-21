import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetSessions, updateSession } from "@/lib/services/whatsapp-session";

vi.mock("@/lib/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue(undefined),
  downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from(""), mimeType: "image/jpeg" }),
}));

vi.mock("@/lib/services/ai-service", () => ({
  runCherttCommand: vi.fn().mockResolvedValue({ reply: "Done." }),
}));

import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";
import { sendTextMessage } from "@/lib/services/whatsapp";
import { runCherttCommand } from "@/lib/services/ai-service";

const mockSend = sendTextMessage as ReturnType<typeof vi.fn>;
const mockRun = runCherttCommand as ReturnType<typeof vi.fn>;

const PHONE = "2348012345678";

// Skip the welcome flow for tests that test post-welcome behaviour
function skipWelcome(phone = PHONE) {
  updateSession(phone, { welcomed: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSessions();
});

describe("processWhatsAppMessage", () => {
  it("sends welcome message on first contact without calling AI", async () => {
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "hi" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledOnce();
    const [, welcomeText] = mockSend.mock.calls[0] as [string, string];
    expect(welcomeText).toContain("Welcome to Chertt");
    expect(welcomeText).toContain("500,000");
    expect(welcomeText).toContain("auth/sign-in");
  });

  it("calls runCherttCommand and sends a reply for a text message after welcome", async () => {
    skipWelcome();
    mockRun.mockResolvedValue({ reply: "Here is your answer." });

    await processWhatsAppMessage({
      from: PHONE,
      type: "text",
      text: "What is the inventory for diesel?",
    });

    expect(mockRun).toHaveBeenCalledWith(
      "What is the inventory for diesel?",
      expect.objectContaining({ role: "owner" }),
      false,
    );
    expect(mockSend).toHaveBeenCalledWith(PHONE, "Here is your answer.");
  });

  it("demo context is included in AI call", async () => {
    skipWelcome();
    mockRun.mockResolvedValue({ reply: "Done." });

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Log an expense" });

    const context = mockRun.mock.calls[0][1] as { memoryContext?: string };
    expect(context.memoryContext).toContain("500,000");
    expect(context.memoryContext).toContain("demo");
  });

  it("CANCEL clears pending state without calling AI", async () => {
    skipWelcome();
    mockRun.mockResolvedValue({
      reply: "",
      pendingConfirmation: { summary: "Create letter", actionKey: "document", previewTitle: "Letter" },
    });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Draft a letter" });

    mockRun.mockClear();
    mockSend.mockClear();

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "cancel" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, "Cancelled.");
  });

  it("CONFIRM re-runs the pending command with confirmed=true", async () => {
    skipWelcome();
    mockRun.mockResolvedValueOnce({
      reply: "",
      pendingConfirmation: { summary: "Create letter", actionKey: "document", previewTitle: "Vendor Letter" },
    });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Draft a vendor letter" });

    mockRun.mockResolvedValueOnce({
      reply: "",
      generatedDocument: {
        id: "doc-1", title: "Vendor Letter", type: "letter", body: "...",
        status: "pending", preparedBy: "Guest", createdAtLabel: "Today",
      },
    });

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "CONFIRM" });

    expect(mockRun).toHaveBeenLastCalledWith("Draft a vendor letter", expect.anything(), true);
  });

  it("sends 'not supported' reply for audio messages", async () => {
    skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "audio" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Voice messages"));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("includes history from previous messages in context", async () => {
    skipWelcome();
    mockRun.mockResolvedValue({ reply: "First reply." });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "First message" });

    mockRun.mockResolvedValue({ reply: "Second reply." });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Second message" });

    const secondCall = mockRun.mock.calls[1];
    const context = secondCall[1] as { history: { speaker: string; text: string }[] };
    expect(context.history.length).toBeGreaterThan(0);
    expect(context.history[0]).toMatchObject({ speaker: "user", text: "First message" });
  });

  it("APPROVE clears pending approval and sends confirmation", async () => {
    skipWelcome();
    mockRun.mockResolvedValueOnce({
      reply: "",
      generatedRequest: {
        id: "req-1", title: "Fuel request", type: "supply", status: "pending",
        requester: "Guest", description: "Diesel for generator",
        module: "toolkit", createdAtLabel: "Today", approvalSteps: [],
      },
    });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Request diesel fuel" });

    mockSend.mockClear();
    mockRun.mockClear();

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "APPROVE" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Approved"));
  });

  it("REJECT with reason sends rejection message", async () => {
    skipWelcome();
    mockRun.mockResolvedValueOnce({
      reply: "",
      generatedRequest: {
        id: "req-1", title: "Fuel request", type: "supply", status: "pending",
        requester: "Guest", description: "Diesel for generator",
        module: "toolkit", createdAtLabel: "Today", approvalSteps: [],
      },
    });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Request diesel fuel" });

    mockSend.mockClear();
    mockRun.mockClear();

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "REJECT budget exceeded" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("budget exceeded"));
  });
});
