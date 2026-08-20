import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { guestConnectFlow } from "@/lib/services/flows/guest-connect";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";

const { findCodeMock, findUserMock, provisionMock, signupMock, menuMock, updateSessionMock } = vi.hoisted(() => ({
  findCodeMock: vi.fn(),
  findUserMock: vi.fn(),
  provisionMock: vi.fn(),
  signupMock: vi.fn(),
  menuMock: vi.fn(),
  updateSessionMock: vi.fn(),
}));
vi.mock("@/lib/services/whatsapp-workspace", () => ({
  findWorkspaceByJoinCode: findCodeMock,
  findWorkspaceByUsername: findUserMock,
}));
vi.mock("@/lib/services/identity/provisioning", () => ({
  provisionPersonMembership: provisionMock,
}));
vi.mock("@/lib/services/onboarding-flow", () => ({
  startSignupFlow: signupMock,
}));
vi.mock("@/lib/services/agent/menu", () => ({
  menuForRole: menuMock,
}));
vi.mock("@/lib/services/whatsapp-session", () => ({
  updateSession: updateSessionMock,
}));

const GRACE = { id: "ws-grace", slug: "grace", name: "Grace Chapel Assembly", city: "Lagos" };

function harness(userName?: string) {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [], userName } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => {
    if (patch.activeFlow === undefined) session.activeFlow = undefined;
    else session.activeFlow = patch.activeFlow;
  };
  const ctx: FlowRunContext = { phone: "2348012345678", link: null, session };
  return { session, update, ctx };
}

async function drive(turns: Array<{ text?: string; buttonId?: string }>, userName?: string) {
  const { session, update, ctx } = harness(userName);
  let out: FlowOutput | null = await startFlow("guest_connect", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(guestConnectFlow);
  findCodeMock.mockResolvedValue(null);
  findUserMock.mockResolvedValue(null);
  provisionMock.mockResolvedValue(true);
  updateSessionMock.mockResolvedValue(undefined);
  menuMock.mockReturnValue([{ id: "menu:checkin", title: "👶 Check in a child", description: "Pickup code + QR pass" }]);
});

describe("guest_connect flow", () => {
  it("attend happy path: who → name → code → confirm → membership + member menu", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([
      { buttonId: "who_attend" },
      { text: "Ada Obi" },
      { text: "GRACE001" },
      { buttonId: "connect_yes" },
    ]);
    expect(provisionMock).toHaveBeenCalledWith({
      phoneNumber: "2348012345678", fullName: "Ada Obi", workspaceId: "ws-grace",
      workspaceSlug: "grace", workspaceName: "Grace Chapel Assembly", role: "member",
    });
    expect(updateSessionMock).toHaveBeenCalledWith("2348012345678", { userName: "Ada Obi" });
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("Grace Chapel Assembly") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("name is asked once — a known name skips ask_name", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }], "Ada Obi");
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Thanks, Ada") });
    expect(session.activeFlow).toMatchObject({ step: "connect_code", data: { fullName: "Ada Obi" } });
  });

  it("an unknown code reprompts and stays on connect_code", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { text: "ZZZZ9999" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("couldn't find") });
    expect(session.activeFlow).toMatchObject({ step: "connect_code" });
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("@username path resolves through findWorkspaceByUsername", async () => {
    findUserMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { text: "@gracechapel" }]);
    expect(findUserMock).toHaveBeenCalledWith("gracechapel");
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Grace Chapel Assembly") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
  });

  it("No at confirm returns to the code step with workspace fields cleared", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([
      { buttonId: "who_attend" }, { text: "Ada" }, { text: "GRACE001" }, { buttonId: "connect_no" },
    ]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("church's *code*") });
    expect(session.activeFlow).toMatchObject({ step: "connect_code", data: { workspaceId: undefined } });
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("leader branch: who_lead sends the web-onboarding urlButton, never a membership", async () => {
    signupMock.mockResolvedValue({ text: "Let's verify your church — tap below.", url: "https://chertt.test/onboard/tok123" });
    const { out, session } = await drive([{ buttonId: "who_lead" }]);
    expect(signupMock).toHaveBeenCalledWith("2348012345678");
    expect(out).toMatchObject({ type: "urlButton", url: "https://chertt.test/onboard/tok123", buttonLabel: "Verify my church" });
    expect(provisionMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });

  it("leader branch without a url falls back to plain text", async () => {
    signupMock.mockResolvedValue({ text: "We couldn't create a link right now — please try again.", url: null });
    const { out } = await drive([{ buttonId: "who_lead" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("try again") });
  });

  it("a typed non-tap at who_are_you nudges with the buttons again", async () => {
    const { out, session } = await drive([{ text: "hello" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Tap one") });
    expect(session.activeFlow).toMatchObject({ step: "who_are_you" });
  });
});
