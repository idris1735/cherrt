import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { pastoralFlow } from "@/lib/services/flows/pastoral";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "request_pastoral_care"
      ? { name: "request_pastoral_care", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
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
  let out: FlowOutput | null = await startFlow("pastoral", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(pastoralFlow);
  handlerMock.mockResolvedValue({ message: "A pastor will reach out to you soon. 🙏" });
});

describe("pastoral flow", () => {
  it("happy path: category → skip details → commits with category only", async () => {
    const { out, session } = await drive([{ buttonId: "pc_marriage" }, { buttonId: "flow_skip" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { category: "marriage", details: undefined },
      expect.objectContaining({ workspaceId: "ws1", userName: "Ada" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("pastor will reach out") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("typed details are passed through", async () => {
    await drive([{ buttonId: "pc_finance" }, { text: "Need help budgeting" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { category: "finance", details: "Need help budgeting" },
      expect.objectContaining({ workspaceId: "ws1" }),
    );
  });

  it("pc_other maps to the general category", async () => {
    await drive([{ buttonId: "pc_other" }, { buttonId: "flow_skip" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { category: "general", details: undefined },
      expect.objectContaining({ workspaceId: "ws1" }),
    );
  });

  it("an off-list tap at category reprompts", async () => {
    const { out, session } = await drive([{ text: "something" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("categories") });
    expect(session.activeFlow).toMatchObject({ step: "category" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
