import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { joinFlow } from "@/lib/services/flows/join";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "join_department"
      ? { name: "join_department", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
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

async function drive(turns: Array<{ text?: string; buttonId?: string }>, seed?: Record<string, unknown>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("join", ctx, update, seed);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(joinFlow);
  handlerMock.mockResolvedValue({ message: "Application sent — a leader will review it. 🙏" });
});

describe("join flow", () => {
  it("happy path: department → apply → commits through join_department", async () => {
    const { out, session } = await drive([{ text: "choir" }, { buttonId: "join_apply" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { department: "choir" },
      expect.objectContaining({ workspaceId: "ws1", userName: "Ada", phone: "2348012345678" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("leader will review") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("change returns to the department step with it cleared", async () => {
    const { out, session } = await drive([{ text: "choir" }, { buttonId: "join_change" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Which ministry") });
    expect(session.activeFlow).toMatchObject({ step: "department", data: { department: undefined } });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("an empty department reprompts", async () => {
    const { out, session } = await drive([{ text: " " }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("which ministry") });
    expect(session.activeFlow).toMatchObject({ step: "department" });
  });

  it("an off-word at confirm asks again instead of applying", async () => {
    const { out, session } = await drive([{ text: "media" }, { text: "maybe later" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Apply") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("a seeded department is never re-asked", async () => {
    const { out, session } = await drive([{ text: "ok" }], { department: "media" });
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("media") });
    expect(session.activeFlow).toMatchObject({ step: "confirm", data: { department: "media" } });
  });
});
