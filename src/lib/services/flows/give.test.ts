import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { giveFlow } from "@/lib/services/flows/give";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "give_now"
      ? { name: "give_now", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
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
  let out: FlowOutput | null = await startFlow("give", ctx, update, seed);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(giveFlow);
  handlerMock.mockResolvedValue({ message: "🙏 To give ₦5,000 (offering), tap here:\nhttps://chertt.test/pay/ref1" });
});

describe("give flow", () => {
  it("happy path: amount → type → confirm commits through give_now", async () => {
    const { out, session } = await drive([
      { text: "5000" },
      { buttonId: "gt_offering" },
      { buttonId: "give_go" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { amount: 5000, givingType: "offering" },
      expect.objectContaining({ workspaceId: "ws1", role: "member", userName: "Ada", phone: "2348012345678", personId: "p1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("tap here") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("an invalid amount reprompts and stays on amount", async () => {
    const { out, session } = await drive([{ text: "abc" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("valid amount") });
    expect(session.activeFlow).toMatchObject({ step: "amount" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("a seeded amount is never re-asked — the first render mentions the type", async () => {
    const { out, session } = await drive([{ text: "ok" }], { amount: 2000 });
    expect(out).toMatchObject({ type: "list", header: "Giving" });
    expect(session.activeFlow).toMatchObject({ step: "giving_type", data: { amount: 2000 } });
  });

  it("cancel at confirm ends with nothing charged", async () => {
    const { out, session } = await drive([{ text: "5000" }, { buttonId: "gt_tithe" }, { buttonId: "give_cancel" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("nothing was charged") });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });

  it("an off-word at confirm asks again instead of committing", async () => {
    const { out, session } = await drive([{ text: "5000" }, { buttonId: "gt_tithe" }, { text: "hmm" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Send link") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
