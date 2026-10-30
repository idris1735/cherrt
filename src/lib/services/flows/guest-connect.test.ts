import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { guestConnectFlow, looksLikeChurch } from "@/lib/services/flows/guest-connect";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";

const { findCodeMock, findUserMock, findNameMock, subActiveMock, provisionMock, verifyStartMock, signupMock, menuMock, updateSessionMock } = vi.hoisted(() => ({
  findCodeMock: vi.fn(),
  findUserMock: vi.fn(),
  findNameMock: vi.fn(),
  subActiveMock: vi.fn(),
  provisionMock: vi.fn(),
  verifyStartMock: vi.fn(),
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
vi.mock("@/lib/services/identity/email-verify", () => ({
  startMemberEmailVerification: verifyStartMock,
}));
vi.mock("@/lib/services/onboarding-flow", () => ({
  startSignupFlow: signupMock,
}));
vi.mock("@/lib/services/agent/menu", () => ({
  mainMenuRows: menuMock,
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
  verifyStartMock.mockResolvedValue(undefined);
  updateSessionMock.mockResolvedValue(undefined);
  menuMock.mockReturnValue([
    { id: "grp:children", title: "👶 Children", description: "Check in a child · Register a child" },
    { id: "help_more", title: "💡 How it works", description: "Every option explained, plus shortcuts" },
  ]);
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
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("Grace Chapel Assembly"), final: true });
    // Lands in the member MAIN menu (sections + How it works), not a dead-end.
    expect(menuMock).toHaveBeenCalledWith("member");
    expect(out?.type === "list" ? out.rows.map((r) => r.id) : []).toEqual(["grp:children", "help_more"]);
    expect(session.activeFlow).toBeUndefined();
  });

  it("name is asked once — a known name skips ask_name", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }], "Ada Obi");
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Thanks, Ada") });
    expect(session.activeFlow).toMatchObject({ step: "connect_code", data: { fullName: "Ada Obi" } });
  });

  it("an unknown code reprompts and stays on connect_code", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "ZZZZ9999" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("couldn't find") });
    expect(session.activeFlow).toMatchObject({ step: "connect_code" });
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("@username path resolves through findWorkspaceByUsername", async () => {
    findUserMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "@gracechapel" }]);
    expect(findUserMock).toHaveBeenCalledWith("gracechapel");
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Grace Chapel Assembly") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
  });

  it("No at confirm returns to the code step with workspace fields cleared", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([
      { buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "GRACE001" }, { buttonId: "connect_no" },
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
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "Grace chapel" }]);
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
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "Grace" }]);
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
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "Nowhere Church" }]);
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
    // async, non-blocking verification fires for the captured email
    expect(verifyStartMock).toHaveBeenCalledWith("ada@example.com");
  });

  it("email verification does NOT fire when the member skipped email", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    await drive([
      { buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "GRACE001" }, { buttonId: "connect_yes" },
    ]);
    expect(verifyStartMock).not.toHaveBeenCalled();
  });

  it("full name — a lone first name is nudged for a surname", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Idris" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("surname") });
    expect(session.activeFlow).toMatchObject({ step: "ask_surname", data: { firstName: "Idris" } });
  });

  it("full name — first + surname combine into the full name, then ask_email", async () => {
    const { session } = await drive([{ buttonId: "who_attend" }, { text: "Idris" }, { text: "Bello" }]);
    expect(session.activeFlow).toMatchObject({ step: "ask_email", data: { fullName: "Idris Bello" } });
  });

  it("basic bio — a non-email reprompts on ask_email with Skip still offered", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada Obi" }, { text: "not-an-email" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("doesn't look like an email") });
    expect(out?.type === "buttons" ? out.buttons[0].id : "").toBe("email_skip");
    expect(session.activeFlow).toMatchObject({ step: "ask_email" });
  });

  it("subscription gate — an inactive church never provisions, and returns to the church step (not a dead-end)", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    subActiveMock.mockResolvedValue(false);
    const { out, session } = await drive([
      { buttonId: "who_attend" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "GRACE001" }, { buttonId: "connect_yes" },
    ]);
    expect(subActiveMock).toHaveBeenCalledWith("ws-grace");
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("isn't active") });
    expect(out?.type === "text" ? out.text : "").toContain("Got a different church?");
    expect(provisionMock).not.toHaveBeenCalled();
    // Name is kept; they can try another church right away (or type menu).
    expect(session.activeFlow).toMatchObject({ step: "connect_code", data: { fullName: "Ada Obi", workspaceId: undefined } });
  });

  it("direction rail — opens with what Chertt does and how to leave", async () => {
    const { out } = await drive([]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("your church on WhatsApp") });
    expect(out?.type === "buttons" ? out.text : "").toContain("Type *menu* anytime to stop");
    expect(out?.type === "buttons" ? out.text : "").toContain("who are you?");
  });

  it("came for my child → after connecting, the next step is registering the child", async () => {
    findCodeMock.mockResolvedValue(GRACE);
    const { out, session } = await drive([
      { buttonId: "who_child" }, { text: "Ada Obi" }, { buttonId: "email_skip" }, { text: "GRACE001" }, { buttonId: "connect_yes" },
    ]);
    expect(provisionMock).toHaveBeenCalled();
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("register your child"), final: true });
    expect(out?.type === "buttons" ? out.buttons.map((b) => b.id) : []).toEqual(["menu:register_child", "main_menu"]);
    expect(session.activeFlow).toBeUndefined();
  });
});

// "Flow of questions" (UAT 22 Oct): after "I attend a church" people typed their
// CHURCH's name at the name question. The step must say plainly it wants THEIR
// name, and a church typed there must never be saved as the person's name.
describe("guest_connect — name step is unmistakable", () => {
  it("asks for YOUR name, says it isn't the church's, and shows the step count", async () => {
    const { out } = await drive([{ buttonId: "who_attend" }]);
    expect(out?.type).toBe("text");
    const text = out?.type === "text" ? out.text : "";
    expect(text).toContain("Step 1 of 3 · Your name");
    expect(text).toContain("What's *your* full name?");
    expect(text).toContain("Not your church's name");
    expect(text).toContain("I'll ask for your church in step 3");
  });

  it("a church NAME typed at the name step is kept as a hint, never saved as the person's name", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Grace Chapel Assembly" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("sounds like your *church*") });
    expect(out?.type === "text" ? out.text : "").toContain("*your own* name");
    expect(session.activeFlow).toMatchObject({ step: "ask_name", data: { churchHint: "Grace Chapel Assembly" } });
    expect(session.activeFlow?.data.fullName).toBeUndefined();
    expect(session.activeFlow?.data.firstName).toBeUndefined();
  });

  it("a church CODE typed at the name step is treated the same way", async () => {
    const { session } = await drive([{ buttonId: "who_attend" }, { text: "GRACE001" }]);
    expect(session.activeFlow).toMatchObject({ step: "ask_name", data: { churchHint: "GRACE001" } });
  });

  it("the church hint is offered back at step 3 — one tap looks it up", async () => {
    findNameMock.mockResolvedValue([GRACE]);
    const h = harness();
    await startFlow("guest_connect", h.ctx, h.update);
    await advanceFlow({ text: "", buttonId: "who_attend" }, h.ctx, h.update);
    await advanceFlow({ text: "Grace Chapel" }, h.ctx, h.update); // church typed at the name step
    await advanceFlow({ text: "Ada Obi" }, h.ctx, h.update); // now their own name
    const step3 = await advanceFlow({ text: "", buttonId: "email_skip" }, h.ctx, h.update);
    expect(step3).toMatchObject({ type: "buttons", text: expect.stringContaining("You mentioned *Grace Chapel*") });
    expect(step3?.type === "buttons" ? step3.text : "").toContain("Step 3 of 3 · Your church");
    expect(step3?.type === "buttons" ? step3.buttons.map((b) => b.id) : []).toEqual(["use_hint"]);
    const confirm = await advanceFlow({ text: "", buttonId: "use_hint" }, h.ctx, h.update);
    expect(findNameMock).toHaveBeenCalledWith("Grace Chapel");
    expect(confirm).toMatchObject({ type: "buttons", text: expect.stringContaining("Grace Chapel Assembly") });
    expect(h.session.activeFlow).toMatchObject({ step: "confirm", data: { fullName: "Ada Obi", workspaceId: "ws-grace", churchHint: undefined } });
  });

  it("a church typed as the SURNAME is refused, not glued onto the name", async () => {
    const { out, session } = await drive([{ buttonId: "who_attend" }, { text: "Ada" }, { text: "Grace Chapel" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("looks like a church name") });
    expect(session.activeFlow).toMatchObject({ step: "ask_surname" });
  });

  it("a stale button tap at the name step is never taken as a name", async () => {
    const { session } = await drive([{ buttonId: "who_attend" }, { text: "🔗 Connect my church", buttonId: "guest_member" }]);
    expect(session.activeFlow).toMatchObject({ step: "ask_name" });
    expect(session.activeFlow?.data.churchHint).toBeUndefined();
  });

  it("looksLikeChurch: church words, codes and @handles — not ordinary names", () => {
    for (const t of ["Grace Chapel", "RCCG Jesus House", "Covenant Christian Centre", "Winners Chapel", "GRACE001", "@gracechapel", "Daystar Christian Center"]) {
      expect(looksLikeChurch(t)).toBe(true);
    }
    for (const t of ["Ada Obi", "Idris Bello", "Grace Okafor", "Faith", "Mercy Johnson"]) {
      expect(looksLikeChurch(t)).toBe(false);
    }
  });
});
