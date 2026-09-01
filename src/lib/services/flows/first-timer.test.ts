import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { firstTimerFlow } from "@/lib/services/flows/first-timer";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "capture_first_timer"
      ? { name: "capture_first_timer", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
      : undefined,
}));

const link: PhoneLink = {
  phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "daystar",
  workspaceName: "Daystar", userName: "Ada", userRole: "member",
};

function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => {
    if (patch.activeFlow === undefined) session.activeFlow = undefined;
    else session.activeFlow = patch.activeFlow;
  };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, update, ctx };
}

async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("first_timer", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(firstTimerFlow);
  handlerMock.mockResolvedValue({ message: "Welcome Sam Doe! We've noted your details and someone will reach out." });
});

describe("first_timer flow", () => {
  it("happy path: name → skip phone → skip invited → commits with name only", async () => {
    const { out, session } = await drive([{ text: "Sam Doe" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { name: "Sam Doe", phone: undefined, invitedBy: undefined },
      expect.objectContaining({ workspaceId: "ws1", userName: "Ada", personId: "p1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("noted your details") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("typed phone and inviter are passed through", async () => {
    await drive([{ text: "Sam Doe" }, { text: "08031234567" }, { text: "Pastor Mike" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { name: "Sam Doe", phone: "08031234567", invitedBy: "Pastor Mike" },
      expect.objectContaining({ workspaceId: "ws1" }),
    );
  });

  it("skip phone but typed inviter still passes the inviter", async () => {
    await drive([{ text: "Sam Doe" }, { buttonId: "flow_skip" }, { text: "Sister Grace" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { name: "Sam Doe", phone: undefined, invitedBy: "Sister Grace" },
      expect.objectContaining({ workspaceId: "ws1" }),
    );
  });

  it("a bad name asks again without advancing", async () => {
    const { out, session } = await drive([{ text: "123" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("visitor's name") });
    expect(session.activeFlow).toMatchObject({ step: "visitor_name" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
