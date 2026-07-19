import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetSessions, updateSession } from "@/lib/services/whatsapp-session";

vi.mock("@/lib/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue(undefined),
  sendInteractiveButtons: vi.fn().mockResolvedValue(undefined),
  downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from(""), mimeType: "image/jpeg" }),
}));

vi.mock("@/lib/services/ai-service", () => ({
  runCherttCommand: vi.fn().mockResolvedValue({ reply: "Done." }),
}));

vi.mock("@/lib/services/whatsapp-templates", () => ({
  sendNewSignupAlertTemplate: vi.fn().mockResolvedValue(undefined),
  sendOrgApprovedTemplate: vi.fn().mockResolvedValue(undefined),
  sendOrgRejectedTemplate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/whatsapp-workspace", async (importOriginal) => {
  // resolveActivePhoneLink (pure logic), isPlatformAdmin/approveOrganization/
  // rejectOrganization/getGivingSummary etc. keep their real implementations
  // via the spread below — they're either pure or safely no-op without a
  // configured Supabase client, matching how they behave in production when
  // Supabase isn't set up. Only the calls the existing tests assert against
  // are stubbed.
  const actual = await importOriginal<typeof import("@/lib/services/whatsapp-workspace")>();
  return {
    ...actual,
    claimWhatsAppMessage: vi.fn().mockResolvedValue(true),
    lookupAllPhoneLinks: vi.fn().mockResolvedValue([]),
    persistWorkspaceAiResult: vi.fn().mockResolvedValue(undefined),
    getApproverPhone: vi.fn().mockResolvedValue(null),
    approveWorkspaceRequest: vi.fn().mockResolvedValue(true),
    rejectWorkspaceRequest: vi.fn().mockResolvedValue(true),
    getWorkflowRequest: vi.fn().mockResolvedValue(null),
    loadWorkspaceContext: vi.fn().mockResolvedValue({ pendingRequests: [], recentExpenses: [], lowInventoryItems: [], pendingIssues: [], givingCategories: [], ministryUnits: [] }),
  };
});

import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";
import { downloadMedia, sendInteractiveButtons, sendTextMessage } from "@/lib/services/whatsapp";
import { runCherttCommand } from "@/lib/services/ai-service";
import { claimWhatsAppMessage } from "@/lib/services/whatsapp-workspace";

const mockSend = sendTextMessage as ReturnType<typeof vi.fn>;
const mockButtons = sendInteractiveButtons as ReturnType<typeof vi.fn>;
const mockDownload = downloadMedia as ReturnType<typeof vi.fn>;
const mockRun = runCherttCommand as ReturnType<typeof vi.fn>;
const mockClaim = claimWhatsAppMessage as ReturnType<typeof vi.fn>;

const PHONE = "2348012345678";

// Skip the welcome flow for tests that test post-welcome behaviour
async function skipWelcome(phone = PHONE) {
  await updateSession(phone, { welcomed: true });
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

  it("does not discard a real command sent as the first message", async () => {
    mockRun.mockResolvedValue({ reply: "Request captured." });

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Request ₦85,000 for diesel" });

    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Welcome to Chertt"));
    expect(mockRun).toHaveBeenCalledWith(
      "Request ₦85,000 for diesel",
      expect.objectContaining({ role: "owner" }),
      false,
    );
    expect(mockSend).toHaveBeenCalledWith(PHONE, "Request captured.");
  });

  it("skips duplicate WhatsApp message IDs before side effects", async () => {
    mockClaim.mockResolvedValueOnce(false);

    await processWhatsAppMessage({ messageId: "wamid.duplicate", from: PHONE, type: "text", text: "Request diesel" });

    expect(mockClaim).toHaveBeenCalledWith("wamid.duplicate", PHONE, "text");
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("calls runCherttCommand and sends a reply for a text message after welcome", async () => {
    await skipWelcome();
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

  it("shows a guided help menu without calling AI", async () => {
    await skipWelcome();

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "I don't know what to do" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockButtons).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("simple menu"),
      expect.arrayContaining([
        expect.objectContaining({ id: "help_request" }),
        expect.objectContaining({ id: "help_expense" }),
        expect.objectContaining({ id: "help_issue" }),
      ]),
      "Chertt menu",
    );
  });

  it("handles help starter buttons without calling AI", async () => {
    await skipWelcome();

    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "help_request" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Request format"));
  });

  it("demo context is included in AI call", async () => {
    await skipWelcome();
    mockRun.mockResolvedValue({ reply: "Done." });

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Log an expense" });

    const context = mockRun.mock.calls[0][1] as { memoryContext?: string };
    expect(context.memoryContext).toContain("500,000");
    expect(context.memoryContext).toContain("demo");
  });

  it("CANCEL clears pending state without calling AI", async () => {
    await skipWelcome();
    mockRun.mockResolvedValue({
      reply: "",
      pendingConfirmation: { summary: "Create letter", actionKey: "document", previewTitle: "Letter" },
    });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Draft a letter" });

    mockRun.mockClear();
    mockSend.mockClear();

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "cancel" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Cancelled"));
  });

  it("CONFIRM re-runs the pending command with confirmed=true", async () => {
    await skipWelcome();
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

  it("sends error reply for audio messages without media ID", async () => {
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "audio" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("voice note"));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("passes non-receipt images to the AI as inline media attachments", async () => {
    await skipWelcome();
    mockDownload.mockResolvedValueOnce({ buffer: Buffer.from("not-a-receipt"), mimeType: "image/jpeg" });
    mockRun.mockResolvedValue({ reply: "Issue photo reviewed." });

    await processWhatsAppMessage({
      from: PHONE,
      type: "image",
      text: "Report this broken window",
      mediaId: "media-1",
    });

    const context = mockRun.mock.calls[0][1] as { mediaAttachments?: Array<{ mimeType: string; data: string }>; memoryContext?: string };
    expect(context.mediaAttachments).toEqual([
      { mimeType: "image/jpeg", data: Buffer.from("not-a-receipt").toString("base64") },
    ]);
    expect(context.memoryContext).not.toContain("data:image/jpeg;base64");
    expect(mockSend).toHaveBeenCalledWith(PHONE, "Issue photo reviewed.");
  });

  it("includes history from previous messages in context", async () => {
    await skipWelcome();
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
    await skipWelcome();
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
    await skipWelcome();
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

  it("REJECT <code> <reason> from a platform admin sends the org-rejected template with the typed reason", async () => {
    vi.stubEnv("PLATFORM_ADMIN_PHONES", PHONE);
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    const rejectSpy = vi
      .spyOn(workspaceModule, "rejectOrganization")
      .mockResolvedValueOnce({ requestedByPhone: "2348099999999", name: "Grace Chapel" });
    const templatesModule = await import("@/lib/services/whatsapp-templates");
    const templateSpy = vi.spyOn(templatesModule, "sendOrgRejectedTemplate");

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "REJECT ab12cd34 budget exceeded" });

    expect(rejectSpy).toHaveBeenCalledWith("ab12cd34");
    expect(templateSpy).toHaveBeenCalledWith("2348099999999", "Grace Chapel", "budget exceeded");

    vi.unstubAllEnvs();
  });

  it("REJECT <code> with no reason from a platform admin uses a default reason", async () => {
    vi.stubEnv("PLATFORM_ADMIN_PHONES", PHONE);
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "rejectOrganization").mockResolvedValueOnce({
      requestedByPhone: "2348099999999",
      name: "Grace Chapel",
    });
    const templatesModule = await import("@/lib/services/whatsapp-templates");
    const templateSpy = vi.spyOn(templatesModule, "sendOrgRejectedTemplate");

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "REJECT ab12cd34" });

    expect(templateSpy).toHaveBeenCalledWith("2348099999999", "Grace Chapel", "doesn't fit right now");

    vi.unstubAllEnvs();
  });
});
