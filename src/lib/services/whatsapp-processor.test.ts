import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetSessions } from "@/lib/services/whatsapp-session";

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

beforeEach(() => {
  vi.clearAllMocks();
  resetSessions();
});

describe("processWhatsAppMessage", () => {
  it("calls runCherttCommand and sends a reply for a text message", async () => {
    mockRun.mockResolvedValue({ reply: "Here is your answer." });

    await processWhatsAppMessage({
      from: "2348012345678",
      type: "text",
      text: "What is the inventory for diesel?",
    });

    expect(mockRun).toHaveBeenCalledWith(
      "What is the inventory for diesel?",
      expect.objectContaining({ role: "owner" }),
      false,
    );
    expect(mockSend).toHaveBeenCalledWith("2348012345678", "Here is your answer.");
  });

  it("replies CANCEL clears pending state without calling AI", async () => {
    mockRun.mockResolvedValue({
      reply: "",
      pendingConfirmation: { summary: "Create letter", actionKey: "document", previewTitle: "Letter" },
    });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "Draft a letter" });

    mockRun.mockClear();
    mockSend.mockClear();

    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "cancel" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith("2348012345678", "Cancelled.");
  });

  it("CONFIRM re-runs the pending command with confirmed=true", async () => {
    mockRun.mockResolvedValueOnce({
      reply: "",
      pendingConfirmation: { summary: "Create letter", actionKey: "document", previewTitle: "Vendor Letter" },
    });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "Draft a vendor letter" });

    mockRun.mockResolvedValueOnce({
      reply: "",
      generatedDocument: {
        id: "doc-1", title: "Vendor Letter", type: "letter", body: "...",
        status: "pending", preparedBy: "Guest", createdAtLabel: "Today",
      },
    });

    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "CONFIRM" });

    expect(mockRun).toHaveBeenLastCalledWith(
      "Draft a vendor letter",
      expect.anything(),
      true,
    );
  });

  it("sends 'not supported' reply for audio messages", async () => {
    await processWhatsAppMessage({ from: "2348012345678", type: "audio" });
    expect(mockSend).toHaveBeenCalledWith(
      "2348012345678",
      expect.stringContaining("Voice messages"),
    );
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("includes history from previous messages in context", async () => {
    mockRun.mockResolvedValue({ reply: "First reply." });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "First message" });

    mockRun.mockResolvedValue({ reply: "Second reply." });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "Second message" });

    const secondCall = mockRun.mock.calls[1];
    const context = secondCall[1] as { history: unknown[] };
    expect(context.history.length).toBeGreaterThan(0);
  });
});
