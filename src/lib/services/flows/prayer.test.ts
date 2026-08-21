import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { prayerFlow } from "@/lib/services/flows/prayer";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "capture_prayer_request"
      ? { name: "capture_prayer_request", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
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
  let out: FlowOutput | null = await startFlow("prayer", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(prayerFlow);
  handlerMock.mockResolvedValue({ message: "Received — the prayer team is on it. 🙏" });
});

describe("prayer flow", () => {
  it("happy path: request → share name → commits with anonymous=false", async () => {
    const { out, session } = await drive([{ text: "Please pray for my mum" }, { buttonId: "prayer_share" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { request: "Please pray for my mum", anonymous: false },
      expect.objectContaining({ workspaceId: "ws1", userName: "Ada", phone: "2348012345678" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("prayer team") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("keep anonymous commits with anonymous=true", async () => {
    const { out } = await drive([{ text: "for my exams" }, { buttonId: "prayer_anon" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { request: "for my exams", anonymous: true },
      expect.objectContaining({ workspaceId: "ws1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("prayer team") });
  });

  it("an empty request reprompts", async () => {
    const { out, session } = await drive([{ text: "  " }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("what to pray about") });
    expect(session.activeFlow).toMatchObject({ step: "request" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("an off-button at the name step asks again", async () => {
    const { out, session } = await drive([{ text: "peace" }, { text: "whatever" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("anonymous") });
    expect(session.activeFlow).toMatchObject({ step: "anon" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
