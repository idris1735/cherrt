import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { guestConnectFlow } from "@/lib/services/flows/guest-connect";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";

const { findCodeMock, findUserMock, findNameMock, subActiveMock, provisionMock, signupMock, menuMock, updateSessionMock } = vi.hoisted(() => ({
  findCodeMock: vi.fn(),
  findUserMock: vi.fn(),
  findNameMock: vi.fn(),
  subActiveMock: vi.fn(),
  provisionMock: vi.fn(),
  signupMock: vi.fn(),
  menuMock: vi.fn(),
  updateSessionMock: vi.fn(),
}));
vi.mock("@/lib/services/whatsapp-workspace", () => ({
  findWorkspaceByJoinCode: findCodeMock,
  findWorkspaceByUsername: findUserMock,
  findWorkspacesByName: findNameMock,
  isWorkspaceSubscriptionActive: subActiveMock,
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
  findNameMock.mockResolvedValue([]);
  subActiveMock.mockResolvedValue(true);
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
      { buttonId: "email_skip" },
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
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { buttonId: "email_skip" }, { text: "ZZZZ9999" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("couldn't find") });
    expect(session.activeFlow).toMatchObject({ step: "connect_code" });
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("@username path resolves through findWorkspaceByUsername", async () => {
    findUserMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { buttonId: "email_skip" }, { text: "@gracechapel" }]);
    expect(findUserMock).toHaveBeenCalledWith("gracechapel");
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Grace Chapel Assembly") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
  });

  it("No at confirm returns to the code step with workspace fields cleared", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([
      { buttonId: "who_attend" }, { text: "Ada" }, { buttonId: "email_skip" }, { text: "GRACE001" }, { buttonId: "connect_no" },
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

  it("P3-A — a church NAME with one match goes straight to confirm", async () => {
    findNameMock.mockResolvedValue([GRACE]);
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { buttonId: "email_skip" }, { text: "Grace chapel" }]);
    expect(findNameMock).toHaveBeenCalledWith("Grace chapel");
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Grace Chapel Assembly") });
    expect(session.activeFlow).toMatchObject({ step: "confirm", data: { workspaceId: "ws-grace" } });
  });

  it("P3-A — several name matches open the pick_church list and resolve the pick", async () => {
    findNameMock.mockResolvedValue([
      { id: "w1", slug: "grace-ikeja", name: "Grace Chapel Ikeja", city: "Lagos" },
      { id: "w2", slug: "grace-abuja", name: "Grace Chapel Abuja", city: "Abuja" },
      { id: "w3", slug: "grace-ph", name: "Grace Chapel PH", city: "Port Harcourt" },
    ]);
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { buttonId: "email_skip" }, { text: "Grace" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("I found a few") });
    expect(out?.type === "list" ? out.rows.length : 0).toBe(3);
    expect(session.activeFlow).toMatchObject({ step: "pick_church" });

    // pick the second church → confirm with its details
    const harness2 = harness("Ada Obi");
    await startFlow("guest_connect", harness2.ctx, harness2.update);
    await advanceFlow({ text: "", buttonId: "who_attend" }, harness2.ctx, harness2.update);
    await advanceFlow({ text: "Grace" }, harness2.ctx, harness2.update);
    const pick = await advanceFlow({ text: "", buttonId: "pick_1" }, harness2.ctx, harness2.update);
    expect(pick).toMatchObject({ type: "buttons", text: expect.stringContaining("Grace Chapel Abuja") });
    expect(harness2.session.activeFlow).toMatchObject({ step: "confirm", data: { workspaceId: "w2", workspaceName: "Grace Chapel Abuja" } });
  });

  it("P3-A — zero matches on any identifier gives the gentle reprompt", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { buttonId: "email_skip" }, { text: "Nowhere Church" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("couldn't find that") });
    expect(session.activeFlow).toMatchObject({ step: "connect_code" });
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("basic bio — a typed email is captured and passed to provisioning", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    await drive([
      { buttonId: "who_attend" },
      { text: "Ada Obi" },
      { text: "ada@example.com" },
      { text: "GRACE001" },
      { buttonId: "connect_yes" },
    ]);
    expect(provisionMock).toHaveBeenCalledWith(expect.objectContaining({
      fullName: "Ada Obi", email: "ada@example.com", workspaceId: "ws-grace", role: "member",
    }));
  });

  it("basic bio — a non-email reprompts on ask_email with Skip still offered", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { text: "not-an-email" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("doesn't look like an email") });
    expect(out?.type === "buttons" ? out.buttons[0].id : "").toBe("email_skip");
    expect(session.activeFlow).toMatchObject({ step: "ask_email" });
  });

  it("subscription gate — an inactive church exits cleanly and never provisions", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    subActiveMock.mockResolvedValue(false);
    const { out, session } = await drive([
      { buttonId: "who_attend" }, { text: "Ada" }, { buttonId: "email_skip" }, { text: "GRACE001" }, { buttonId: "connect_yes" },
    ]);
    expect(subActiveMock).toHaveBeenCalledWith("ws-grace");
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("isn't active") });
    expect(provisionMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
