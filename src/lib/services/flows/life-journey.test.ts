import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { lifeJourneyFlow } from "@/lib/services/flows/life-journey";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

// handlerMock is called as (toolName, args, ctx) so each test can assert the
// RIGHT tool was routed for the chosen journey type.
const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => {
    const valid = ["register_baptism", "enroll_discipleship", "register_marriage_prep", "start_bereavement_support"];
    return valid.includes(name)
      ? { name, description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: (args: unknown, ctx: unknown) => handlerMock(name, args, ctx) }
      : undefined;
  },
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
  let out: FlowOutput | null = await startFlow("life_journey", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(lifeJourneyFlow);
  handlerMock.mockResolvedValue({ message: "Done — a pastor will follow up. 🙏" });
});

describe("life_journey flow", () => {
  it("baptism + Me → register_baptism with no candidate (defaults to sender)", async () => {
    const { session } = await drive([{ buttonId: "lj_baptism" }, { buttonId: "lj_me" }]);
    expect(handlerMock).toHaveBeenCalledWith("register_baptism", { candidate: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(session.activeFlow).toBeUndefined();
  });

  it("new believer + typed name → enroll_discipleship with the convert", async () => {
    await drive([{ buttonId: "lj_discipleship" }, { text: "John Ade" }]);
    expect(handlerMock).toHaveBeenCalledWith("enroll_discipleship", { convert: "John Ade" }, expect.objectContaining({ workspaceId: "ws1" }));
  });

  it("bereavement + Skip → start_bereavement_support with no notes", async () => {
    const { out } = await drive([{ buttonId: "lj_bereavement" }, { buttonId: "flow_skip" }]);
    expect(handlerMock).toHaveBeenCalledWith("start_bereavement_support", { notes: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text" });
  });

  it("the detail prompt is tailored to the chosen type", async () => {
    const { out, session } = await drive([{ buttonId: "lj_baptism" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("baptised") });
    expect(session.activeFlow).toMatchObject({ step: "detail", data: { journeyType: "baptism" } });
  });

  it("an off-list tap at the type picker reprompts and never commits", async () => {
    const { out, session } = await drive([{ text: "hmm" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("Tap one") });
    expect(session.activeFlow).toMatchObject({ step: "journey_type" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
