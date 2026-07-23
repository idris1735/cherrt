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

// Keep looksLikeQuestion real (routing logic under test) but stub the agent
// call. Default null = "no answer / Gemini unavailable" so it falls through,
// matching how it behaves in tests without a Gemini key.
vi.mock("@/lib/services/agent/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/agent/runtime")>();
  return { ...actual, runAgentQuery: vi.fn().mockResolvedValue(null), runGuestAgent: vi.fn().mockResolvedValue(null) };
});

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
import { claimWhatsAppMessage, lookupAllPhoneLinks } from "@/lib/services/whatsapp-workspace";
import { runAgentQuery, runGuestAgent } from "@/lib/services/agent/runtime";

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
    expect(welcomeText).toContain("Chertt");
    expect(welcomeText).toContain("set up my church");
  });

  it("does not discard a real command sent as the first message", async () => {
    mockRun.mockResolvedValue({ reply: "Request captured." });

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Request ₦85,000 for diesel" });

    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("set up my church"));
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
      expect.stringContaining("help with"),
      expect.arrayContaining([
        expect.objectContaining({ id: "help_give" }),
        expect.objectContaining({ id: "help_prayer" }),
        expect.objectContaining({ id: "help_checkin" }),
      ]),
      "How can I help?",
    );
  });

  it("handles help starter buttons without calling AI", async () => {
    await skipWelcome();

    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "help_give" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Giving"));
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

  it("answers an org-wide overview query by combining metrics across all the sender's branches", async () => {
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "getOrganizationWorkspaces").mockResolvedValueOnce([
      { id: "branch-a", name: "Grace Chapel — Lagos" },
      { id: "branch-b", name: "Grace Chapel — Abuja" },
    ]);

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "how did we do across all branches" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockButtons).toHaveBeenCalledOnce();
    const [, text, buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(text).toContain("All Branches — Overview");
    expect(text).toContain("Grace Chapel — Lagos");
    expect(text).toContain("Grace Chapel — Abuja");
    expect(buttons).toEqual([{ id: "rpt:org-giving", title: "Giving (all branches)" }]);
  });

  it("tells a phone with no resolvable org branches this feature is for org admins", async () => {
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "getOrganizationWorkspaces").mockResolvedValueOnce([]);

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "giving across all branches" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("organization admins"));
    expect(mockButtons).not.toHaveBeenCalled();
  });

  it("flips from the org overview report to the org giving report via the button", async () => {
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "getOrganizationWorkspaces").mockResolvedValueOnce([
      { id: "branch-a", name: "Grace Chapel — Lagos" },
    ]);

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "rpt:org-giving" });

    expect(mockButtons).toHaveBeenCalledOnce();
    const [, text] = mockButtons.mock.calls[0] as [string, string];
    expect(text).toContain("All Branches — Giving");
    expect(text).toContain("Grace Chapel — Lagos");
  });

  it("answers a linked user's question via the tool-calling agent, not the creation path", async () => {
    vi.mocked(lookupAllPhoneLinks).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ruth", userRole: "owner" },
    ]);
    vi.mocked(runAgentQuery).mockResolvedValueOnce({ kind: "text", text: "You have 12 members." });

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "how many members do we have" });

    expect(runAgentQuery).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(PHONE, "You have 12 members.");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("falls back to the creation path when the agent is unavailable", async () => {
    vi.mocked(lookupAllPhoneLinks).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ruth", userRole: "owner" },
    ]);
    // runAgentQuery default mock resolves null (no Gemini) → creator handles it
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "draft a letter to the bank" });

    expect(runAgentQuery).toHaveBeenCalledOnce();
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it("greets an unlinked guest as the church-focused Chertt, not the old bot", async () => {
    // no phone link → guest
    vi.mocked(runGuestAgent).mockResolvedValueOnce("Hi! I'm Chertt — I help churches run things on WhatsApp. Reply 'set up my church' to begin.");
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "what is this about" });
    expect(runGuestAgent).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("set up my church"));
    expect(mockRun).not.toHaveBeenCalled(); // old creator not used for guests anymore
  });

  it("routes a linked member's image to the multimodal agent (with media)", async () => {
    vi.mocked(lookupAllPhoneLinks).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "finance" },
    ]);
    mockDownload.mockResolvedValueOnce({ buffer: Buffer.from("imgbytes"), mimeType: "image/jpeg" });
    vi.mocked(runAgentQuery).mockResolvedValueOnce({ kind: "text", text: "🧾 Logged ₦15,000 for diesel." });

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "image", mediaId: "m1" });

    expect(runAgentQuery).toHaveBeenCalledOnce();
    const media = vi.mocked(runAgentQuery).mock.calls[0][2];
    expect(media?.[0]).toMatchObject({ mimeType: "image/jpeg" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, "🧾 Logged ₦15,000 for diesel.");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("routes ANY linked-member free text to the agent (not just matched phrasings)", async () => {
    vi.mocked(lookupAllPhoneLinks).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ruth", userRole: "member" },
    ]);
    vi.mocked(runAgentQuery).mockResolvedValueOnce({ kind: "text", text: "Amen! 🙏" });

    await skipWelcome();
    // Not a question and no action verb — previously this went to the creator.
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "praise God, what a service today" });

    expect(runAgentQuery).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(PHONE, "Amen! 🙏");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("routes a safe action (log expense) to the agent", async () => {
    vi.mocked(lookupAllPhoneLinks).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ruth", userRole: "owner" },
    ]);
    vi.mocked(runAgentQuery).mockResolvedValueOnce({ kind: "text", text: "Logged ₦15,000 for diesel." });

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "log ₦15k expense for diesel" });

    expect(runAgentQuery).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(PHONE, "Logged ₦15,000 for diesel.");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("refuses a workspace report to a plain member (role-gated)", async () => {
    vi.mocked(lookupAllPhoneLinks).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ruth", userRole: "member" },
    ]);
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "sales this month" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("admins and leaders"));
    expect(mockButtons).not.toHaveBeenCalled();
  });

  it("stores a pending agent action on a gated proposal, then runs it on YES", async () => {
    const link = { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ruth", userRole: "owner" };
    vi.mocked(lookupAllPhoneLinks).mockResolvedValueOnce([link]).mockResolvedValueOnce([link]);
    vi.mocked(runAgentQuery).mockResolvedValueOnce({
      kind: "pending",
      toolName: "draft_document",
      args: { title: "Bank letter", type: "letter", body: "Dear Bank..." },
      preview: "📄 Draft this letter: *Bank letter*?",
    });

    await skipWelcome();
    // 1) proposal → stored + confirm prompt
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "draft a letter to the bank" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Reply *YES*"));

    // 2) YES → the real draft_document handler runs (no Supabase in tests, so it
    // surfaces a graceful storage error) and does NOT fall to the creation path.
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "yes" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Couldn't complete"));
    expect(mockRun).not.toHaveBeenCalled();
  });
});
