import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSession, resetSessions, updateSession } from "@/lib/services/whatsapp-session";

vi.mock("@/lib/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue(undefined),
  sendInteractiveButtons: vi.fn().mockResolvedValue(undefined),
  sendInteractiveList: vi.fn().mockResolvedValue(undefined),
  sendUrlButton: vi.fn().mockResolvedValue(undefined),
  downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from(""), mimeType: "image/jpeg" }),
}));

vi.mock("@/lib/services/chat-attachments", () => ({
  persistChatAttachment: vi.fn().mockResolvedValue({ id: "a1", storagePath: "ws1/p1/a1.jpg" }),
}));

vi.mock("@/lib/services/approvals/department", () => ({
  decideDepartmentRequest: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/services/demo-reset", () => ({
  resetSenderData: vi.fn().mockResolvedValue({ wiped: [] }),
}));

vi.mock("@/lib/services/identity/provisioning", () => ({
  provisionPersonMembership: vi.fn().mockResolvedValue(true),
  ensureVerifiedPerson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/identity/email-verify", () => ({
  confirmMemberEmail: vi.fn().mockResolvedValue({ status: "verified", email: "you@example.com" }),
  startMemberEmailVerification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/billing/subscription", () => ({
  getWorkspaceBilling: vi.fn().mockResolvedValue({ organizationId: "org1", sub: { status: "active", plan: "Chertt Standard", expiresAt: null } }),
  isSubscriptionActive: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/services/ai-service", () => ({
  runCherttCommand: vi.fn().mockResolvedValue({ reply: "Done." }),
}));

// WS3: keep assessRisk REAL (that's what we're proving) and spy on the flag.
vi.mock("@/lib/services/safety/flags", () => ({
  flagMessage: vi.fn().mockResolvedValue(undefined),
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
    findWorkspaceByJoinCode: vi.fn().mockResolvedValue(null),
    findWorkspaceByUsername: vi.fn().mockResolvedValue(null),
    persistWorkspaceAiResult: vi.fn().mockResolvedValue(undefined),
    getApproverPhone: vi.fn().mockResolvedValue(null),
    approveWorkspaceRequest: vi.fn().mockResolvedValue(true),
    rejectWorkspaceRequest: vi.fn().mockResolvedValue(true),
    getWorkflowRequest: vi.fn().mockResolvedValue(null),
    loadWorkspaceContext: vi.fn().mockResolvedValue({ pendingRequests: [], recentExpenses: [], lowInventoryItems: [], pendingIssues: [], givingCategories: [], ministryUnits: [] }),
  };
});

import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";
import { downloadMedia, sendInteractiveButtons, sendInteractiveList, sendTextMessage } from "@/lib/services/whatsapp";
import { runCherttCommand } from "@/lib/services/ai-service";
import { claimWhatsAppMessage, lookupAllPhoneLinks, findWorkspaceByJoinCode, findWorkspaceByUsername } from "@/lib/services/whatsapp-workspace";
import { provisionPersonMembership } from "@/lib/services/identity/provisioning";
import { confirmMemberEmail } from "@/lib/services/identity/email-verify";
import { getWorkspaceBilling } from "@/lib/services/billing/subscription";
import { runAgentQuery, runGuestAgent } from "@/lib/services/agent/runtime";
import { flagMessage } from "@/lib/services/safety/flags";
import { persistChatAttachment } from "@/lib/services/chat-attachments";
import { decideDepartmentRequest } from "@/lib/services/approvals/department";
import { resetSenderData } from "@/lib/services/demo-reset";

const mockSend = sendTextMessage as ReturnType<typeof vi.fn>;
const mockButtons = sendInteractiveButtons as ReturnType<typeof vi.fn>;
const mockList = sendInteractiveList as ReturnType<typeof vi.fn>;
const mockDownload = downloadMedia as ReturnType<typeof vi.fn>;
const mockRun = runCherttCommand as ReturnType<typeof vi.fn>;
const mockClaim = claimWhatsAppMessage as ReturnType<typeof vi.fn>;
const mockPersist = persistChatAttachment as ReturnType<typeof vi.fn>;

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
    // Guest welcome now sends interactive buttons (richer than bare text)
    expect(mockButtons).toHaveBeenCalledOnce();
    const [, bodyText, buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(bodyText).toContain("Chertt");
    // Consent-first: the very first message is the privacy consent gate.
    expect(buttons.some((b) => b.title.includes("I agree"))).toBe(true);
    mockButtons.mockClear();
    mockSend.mockClear();
  });

  it("shows the consent gate before processing a guest's first message", async () => {
    mockRun.mockResolvedValue({ reply: "Request captured." });

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Request ₦85,000 for diesel" });

    // Consent-first: the gate is shown and nothing is processed until they agree.
    expect(mockButtons).toHaveBeenCalledOnce();
    const [, , gate] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(gate.some((b) => b.title.includes("I agree"))).toBe(true);
    expect(mockRun).not.toHaveBeenCalled();
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

  it("WS-A: persists an inbound image to the chat-attachments store", async () => {
    await skipWelcome();
    mockDownload.mockResolvedValueOnce({ buffer: Buffer.from("photo-bytes"), mimeType: "image/jpeg" });
    mockRun.mockResolvedValue({ reply: "Got it." });

    await processWhatsAppMessage({ from: PHONE, type: "image", text: "save this", mediaId: "media-1" });

    expect(mockPersist).toHaveBeenCalledWith({
      workspaceId: null,
      personId: null,
      kind: "image",
      buffer: Buffer.from("photo-bytes"),
      mimeType: "image/jpeg",
      caption: "save this",
    });
  });

  it("WS-A: persists a document attachment", async () => {
    await skipWelcome();
    mockDownload.mockResolvedValueOnce({ buffer: Buffer.from("pdf-bytes"), mimeType: "application/pdf" });
    mockRun.mockResolvedValue({ reply: "Got it." });

    await processWhatsAppMessage({ from: PHONE, type: "document", text: "my certificate", mediaId: "media-2" });

    expect(mockPersist).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "document", mimeType: "application/pdf", caption: "my certificate" }),
    );
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
    expect(text).toContain("All Branches — at a glance");
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
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "giving this month" });
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

  it("an unlinked phone gets the consent gate (tappable) on first contact", async () => {
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "hi" });
    expect(mockButtons).toHaveBeenCalledOnce();
    const [, bodyText, buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(bodyText).toContain("Chertt");
    expect(buttons.some((b) => b.title.includes("I agree"))).toBe(true);
  });

  it("tapping “I agree” on the consent gate opens the who-are-you menu", async () => {
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "interactive", text: "", buttonReplyId: "guest_consent" });
    expect(mockButtons).toHaveBeenCalledOnce();
    const [, , buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(buttons.some((b) => b.title.includes("I lead a church"))).toBe(true);
  });

  it("an already-welcomed GUEST asking for a menu gets tappable buttons, not the AI", async () => {
    await skipWelcome();
    for (const msg of ["Do you have any menu?", "how does this work", "options"]) {
      mockButtons.mockClear();
      await processWhatsAppMessage({ from: PHONE, type: "text", text: msg });
      expect(mockButtons).toHaveBeenCalledOnce();
      const [, , buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
      expect(buttons.some((b) => b.title.includes("I lead a church"))).toBe(true);
    }
  });

  it("'menu' opens a role-aware interactive list for a linked member", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Idris", userRole: "creator" },
    ]);
    await updateSession(PHONE, { welcomed: true, onboarding: undefined, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "menu" });
    expect(mockList).toHaveBeenCalled();
    const [, , , rows] = mockList.mock.calls[0] as [string, string, string, Array<{ id: string; title: string }>];
    expect(rows.some((r) => r.id === "menu:give")).toBe(true);
    expect(rows.some((r) => r.id === "menu:giving_month")).toBe(true); // creator sees finance rows
    expect(rows.some((r) => r.id === "menu:checkin")).toBe(true);
    expect(rows.length).toBe(10);
    expect(rows.some((r) => r.id === "role:menu")).toBe(false); // no demo role-switch
  });

  it("the menu is role-aware: a member never sees leadership rows", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, onboarding: undefined, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "menu" });
    const [, , , rows] = mockList.mock.calls[0] as [string, string, string, Array<{ id: string }>];
    const allIds = rows.map((r) => r.id);
    expect(allIds).toContain("menu:give");
    expect(allIds).not.toContain("menu:giving_month");
    expect(allIds).not.toContain("menu:members");
    expect(allIds).not.toContain("menu:announce");
  });

  it("tapping a non-rail menu row feeds its prompt through the normal agent path", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, onboarding: undefined, activeWorkspaceId: "ws1" });
    // menu:birthdays is a read row — NOT rail-backed — so it still feeds the agent.
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "menu:birthdays" });
    // runAgentQuery is stubbed to null (no Gemini) so it falls through to the creator.
    expect(runCherttCommand).toHaveBeenCalledWith("Whose birthdays are coming up?", expect.anything(), false);
  });

  it("'More actions' opens menu page 2 with the overflow rows", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Idris", userRole: "creator" },
    ]);
    await updateSession(PHONE, { welcomed: true, onboarding: undefined, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "menu_more" });
    const [, , , rows] = mockList.mock.calls[0] as [string, string, string, Array<{ id: string }>];
    const allIds = rows.map((r) => r.id);
    expect(allIds).toContain("menu:join_dept"); // overflow begins on page 2
    expect(allIds).toContain("menu:announce");
  });

  it("'help first-timer' button sends a first-timer guide", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "help_firsttimer" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("First time"));
    mockSend.mockClear();
  });

  it("'help join' button sends a ministry joining guide", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "help_join" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Join"));
    mockSend.mockClear();
  });

  it("'help event' button sends an events guide", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "help_event" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Events"));
    mockSend.mockClear();
  });

  it("'help service' button sends a service recording guide", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "pastor" },
    ]);
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "help_service" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Record"));
    mockSend.mockClear();
  });

  it("'help more' button sends the full help menu", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "help_more" });
    expect(mockButtons).toHaveBeenCalled(); // sends help menu with buttons
    mockButtons.mockClear();
    mockSend.mockClear();
  });

  it("approve_dept button decides via the quorum service and notifies member + other leaders", async () => {
    const mockDecide = decideDepartmentRequest as ReturnType<typeof vi.fn>;
    mockDecide.mockResolvedValueOnce({
      status: "approved", memberName: "Ada", unitName: "Choir",
      memberPhone: "+2348009", otherApprovers: ["+2348002"],
    });
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "approve_dept:dm1" });
    expect(mockDecide).toHaveBeenCalledWith("dm1", PHONE, "approve");
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Approved Ada"));
    expect(mockSend).toHaveBeenCalledWith("+2348009", expect.stringContaining("You're in"));
    expect(mockSend).toHaveBeenCalledWith("+2348002", expect.stringContaining("approved"));
  });

  it("decline_dept button declines and the member is told", async () => {
    const mockDecide = decideDepartmentRequest as ReturnType<typeof vi.fn>;
    mockDecide.mockResolvedValueOnce({
      status: "declined", memberName: "Ada", unitName: "Choir",
      memberPhone: "+2348009", otherApprovers: [],
    });
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "decline_dept:dm1" });
    expect(mockDecide).toHaveBeenCalledWith("dm1", PHONE, "decline");
    expect(mockSend).toHaveBeenCalledWith("+2348009", expect.stringContaining("declined"));
  });

  it("a decision on an already-resolved request says so", async () => {
    const mockDecide = decideDepartmentRequest as ReturnType<typeof vi.fn>;
    mockDecide.mockResolvedValueOnce(null);
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "approve_dept:dm9" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("already been decided"));
  });

  it("P0-1 — a welcomed guest prompted for a code gets linked when they send a bare code", async () => {
    const mockFind = findWorkspaceByJoinCode as ReturnType<typeof vi.fn>;
    mockFind.mockResolvedValueOnce({ id: "ws-daystar", slug: "daystar", name: "Daystar Christian Centre", city: "Lagos" });
    await updateSession(PHONE, { welcomed: true, awaitingJoinCode: true });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "DAYSTAR3" });
    expect(mockFind).toHaveBeenCalledWith("DAYSTAR3");
    // P0-2 — never links silently: reflects the church back and asks to confirm.
    expect(mockButtons).toHaveBeenCalledWith(PHONE, expect.stringContaining("Daystar Christian Centre"), expect.anything(), expect.anything());
    expect(provisionPersonMembership).not.toHaveBeenCalled();
  });

  it("P0-2 — YES on the church confirm links the person and greets by church name", async () => {
    await updateSession(PHONE, {
      welcomed: true,
      pendingJoin: { workspaceId: "ws-daystar", slug: "daystar", name: "Daystar Christian Centre", city: "Lagos" },
    });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "join_yes" });
    expect(provisionPersonMembership).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumber: PHONE, workspaceId: "ws-daystar", workspaceName: "Daystar Christian Centre", role: "member",
    }));
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("connected to *Daystar Christian Centre*"));
  });

  it("P0-2 — NO on the church confirm clears the pending join without linking", async () => {
    await updateSession(PHONE, {
      welcomed: true,
      pendingJoin: { workspaceId: "ws-daystar", slug: "daystar", name: "Daystar Christian Centre", city: "Lagos" },
    });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "join_no" });
    expect(provisionPersonMembership).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("right code"));
  });

  it("P2-2 — a bare @username resolves the church and asks to confirm (code lookup first)", async () => {
    const mockFind = findWorkspaceByJoinCode as ReturnType<typeof vi.fn>;
    const mockUser = findWorkspaceByUsername as ReturnType<typeof vi.fn>;
    mockFind.mockResolvedValueOnce(null);
    mockUser.mockResolvedValueOnce({ id: "ws-daystar", slug: "daystar", name: "Daystar Christian Centre", city: "Lagos" });
    await updateSession(PHONE, { welcomed: true, awaitingJoinCode: true });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "@daystarcc" });
    expect(mockFind).toHaveBeenCalledWith("daystarcc"); // code lookup runs first
    expect(mockUser).toHaveBeenCalledWith("daystarcc");
    expect(mockButtons).toHaveBeenCalledWith(PHONE, expect.stringContaining("Daystar Christian Centre"), expect.anything(), expect.anything());
    expect(provisionPersonMembership).not.toHaveBeenCalled();
  });

  it("P2-2 — JOIN @username links instantly, like JOIN <code>", async () => {
    const mockUser = findWorkspaceByUsername as ReturnType<typeof vi.fn>;
    mockUser.mockResolvedValueOnce({ id: "ws-daystar", slug: "daystar", name: "Daystar Christian Centre", city: "Lagos" });
    await updateSession(PHONE, { welcomed: true });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "JOIN @daystarcc" });
    expect(mockUser).toHaveBeenCalledWith("daystarcc");
    expect(provisionPersonMembership).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-daystar", role: "member" }));
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Welcome to *Daystar Christian Centre*"));
  });

  it("P0-3 — a returning linked member gets a per-church welcome-back, never a code prompt", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "hi" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Welcome back, Idris"));
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Daystar Christian Centre"));
    expect(mockSend.mock.calls.flat().join(" ")).not.toContain("code");
  });

  it("P0-5 — #reset wipes the sender's own data and starts them fresh", async () => {
    const mockReset = resetSenderData as ReturnType<typeof vi.fn>;
    await updateSession(PHONE, { welcomed: true, userName: "Idris" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "#reset" });
    expect(mockReset).toHaveBeenCalledWith(PHONE);
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("wiped"));
    const fresh = await getSession(PHONE);
    expect(fresh.welcomed).toBe(false);
    expect(fresh.userName).toBeUndefined();
  });

  it("P1 — menu:checkin starts the child check-in flow instead of the agent", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "menu:checkin" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("check your child in"));
    expect(mockRun).not.toHaveBeenCalled();
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ name: "child_checkin", step: "child_name" });
  });

  it("P1 — every message mid-flow routes to the engine (text advances the rail)", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1", activeFlow: { name: "child_checkin", step: "child_name", data: {} } });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Zoe" });
    expect(mockButtons).toHaveBeenCalledWith(PHONE, expect.stringContaining("How old is Zoe"), expect.anything(), expect.anything());
    expect(mockRun).not.toHaveBeenCalled();
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ step: "age", data: { childName: "Zoe" } });
  });

  it("P1 — typing menu mid-flow exits the flow politely (never the main menu)", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1", activeFlow: { name: "child_checkin", step: "age", data: { childName: "Zoe" } } });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "menu" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("stopped that"));
    const s = await getSession(PHONE);
    expect(s.activeFlow).toBeUndefined();
  });

  it("P1 — #reset still wins over an active flow", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeFlow: { name: "child_checkin", step: "child_name", data: {} } });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "#reset" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("wiped"));
    const s = await getSession(PHONE);
    expect(s.activeFlow).toBeUndefined();
  });

  it("P2 — tapping I agree on the consent gate starts the guest-connect rail", async () => {
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "interactive", text: "", buttonReplyId: "guest_consent" });
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ name: "guest_connect", step: "who_are_you" });
    expect(mockButtons).toHaveBeenCalled();
    const [, , buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(buttons.map((b) => b.id)).toEqual(["who_attend", "who_child", "who_lead"]);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("P2 — a guest mid-rail who taps who_attend advances to the name question", async () => {
    await updateSession(PHONE, { welcomed: true, activeFlow: { name: "guest_connect", step: "who_are_you", data: {} } });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "who_attend" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("full name"));
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ step: "ask_name" });
  });

  it("P2 — #reset still wins over an active guest-connect flow", async () => {
    await updateSession(PHONE, { welcomed: true, activeFlow: { name: "guest_connect", step: "connect_code", data: { fullName: "Ada" } } });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "#reset" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("wiped"));
    const s = await getSession(PHONE);
    expect(s.activeFlow).toBeUndefined();
  });

  it("P3 — tapping menu:give starts the give flow, not the agent", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "menu:give" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("How much would you like to give"));
    expect(mockRun).not.toHaveBeenCalled();
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ name: "give", step: "amount" });
  });

  it("P2a — tapping menu:register_child starts the child-registration rail, not the agent", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "menu:register_child" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("full name"));
    expect(mockRun).not.toHaveBeenCalled();
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ name: "child_register", step: "child_name" });
  });

  it("verify <code> confirms the member's email and replies", async () => {
    await skipWelcome();
    (confirmMemberEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: "verified", email: "you@example.com" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "verify 123456" });
    expect(confirmMemberEmail).toHaveBeenCalledWith(PHONE, "123456");
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Email confirmed"));
  });

  it("verify <code> with a wrong code stays reassuring, not alarming", async () => {
    await skipWelcome();
    (confirmMemberEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: "bad_code" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "verify 000000" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("already connected"));
  });

  it("a connected member typing 'subscription' gets status + the demo billing link", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "subscription" });
    expect(getWorkspaceBilling).toHaveBeenCalledWith("ws1");
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("/billing/org1"));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("multi-church: 'switch' shows a tap-to-switch list of the member's churches", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace HQ", userName: "Ada", userRole: "member" },
      { phoneNumber: PHONE, userId: null, workspaceId: "ws2", workspaceSlug: "daystar", workspaceName: "Daystar", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "switch" });
    expect(mockList).toHaveBeenCalled();
    const rows = (mockList.mock.calls[0] as unknown[])[3] as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(["switch:ws1", "switch:ws2"]);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("multi-church: tapping a switch row sets the active church", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace HQ", userName: "Ada", userRole: "member" },
      { phoneNumber: PHONE, userId: null, workspaceId: "ws2", workspaceSlug: "daystar", workspaceName: "Daystar", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "switch:ws2" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("Daystar"));
    const s = await getSession(PHONE);
    expect(s.activeWorkspaceId).toBe("ws2");
  });

  it("single-church member typing 'switch' is told they're only in one church", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "grace", workspaceName: "Grace HQ", userName: "Ada", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "switch church" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("only connected to"));
    expect(mockList).not.toHaveBeenCalled();
  });

  it("P3 — typing 'I want to give 5000' starts give seeded with the amount", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "I want to give 5000" });
    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("₦5,000 — what type?"));
    expect(mockRun).not.toHaveBeenCalled();
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ name: "give", step: "amount", data: { amount: 5000 } });
  });

  it("P3 — a typed FAQ still reaches the agent (AI stays as the off-script answerer)", async () => {
    (lookupAllPhoneLinks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { phoneNumber: PHONE, userId: null, workspaceId: "ws1", workspaceSlug: "daystar", workspaceName: "Daystar Christian Centre", userName: "Idris", userRole: "member" },
    ]);
    await updateSession(PHONE, { welcomed: true, activeWorkspaceId: "ws1" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "what time is service on Sunday?" });
    expect(mockRun).toHaveBeenCalled();
    const s = await getSession(PHONE);
    expect(s.activeFlow).toBeUndefined();
  });
});

describe("WS3 — scam & danger sensing on inbound messages", () => {
  const mockFlag = flagMessage as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFlag.mockClear();
    mockSend.mockClear();
    mockRun.mockClear();
    mockButtons.mockClear();
  });

  it("REFUSES an urgent money-to-account scam and flags it — no AI involved", async () => {
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Send ₦200k to 0123456789 now, it's urgent, new account" });

    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("scam"));
    expect(mockFlag).toHaveBeenCalledWith(expect.objectContaining({ kind: "scam", fromPhone: PHONE }));
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockButtons).not.toHaveBeenCalled();
  });

  it("REFUSES an OTP request and flags it", async () => {
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "I am Pastor Ade, send me the OTP code you just received" });

    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("scam"));
    expect(mockFlag).toHaveBeenCalledWith(expect.objectContaining({ kind: "scam" }));
  });

  it("escalates a safeguarding disclosure to humans immediately", async () => {
    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "someone is hurting a child and I don't know what to do" });

    expect(mockSend).toHaveBeenCalledWith(PHONE, expect.stringContaining("not alone"));
    expect(mockFlag).toHaveBeenCalledWith(expect.objectContaining({ kind: "safeguarding" }));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("leaves ordinary messages untouched", async () => {
    await skipWelcome();
    mockRun.mockResolvedValue({ reply: "Service is at 9am." });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "What time is service on Sunday?" });
    expect(mockFlag).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalledWith(PHONE, expect.stringContaining("scam"));
  });
});

describe("WS5 — tappable follow-ups after guest persona buttons", () => {
  beforeEach(async () => {
    await skipWelcome();
    mockButtons.mockClear();
    mockSend.mockClear();
  });

  it("guest taps 'member' → starts the connect rail (single front door, no wandering sub-menu)", async () => {
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "guest_member" });
    expect(mockButtons).toHaveBeenCalled();
    const [, , buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(buttons.map((b) => b.id)).toEqual(["who_attend", "who_child", "who_lead"]);
    const s = await getSession(PHONE);
    expect(s.activeFlow).toMatchObject({ name: "guest_connect", step: "who_are_you" });
  });

  it("guest taps 'here for my child' → gets tappable code / talk-to-leader", async () => {
    await processWhatsAppMessage({ from: PHONE, type: "interactive", buttonReplyId: "guest_child" });
    const [, , buttons] = mockButtons.mock.calls[0] as [string, string, Array<{ id: string; title: string }>];
    expect(buttons.map((b) => b.id)).toEqual(["guest_code", "guest_help"]);
  });
});
