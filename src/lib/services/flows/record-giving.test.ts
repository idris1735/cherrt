import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { recordGivingFlow } from "@/lib/services/flows/record-giving";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "record_giving"
      ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 3, mutates: true, handler: handlerMock }
      : undefined,
}));

function harness(role = "finance") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Fin", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, update, ctx };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "finance") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("record_giving", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(recordGivingFlow); handlerMock.mockResolvedValue({ message: "✅ Giving recorded." }); });

describe("record_giving flow", () => {
  it("amount → type → anonymous → confirm commits", async () => {
    const { out, session } = await drive([{ text: "5000" }, { buttonId: "rg_offering" }, { buttonId: "rg_anon" }, { buttonId: "rg_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ amount: 5000, givingType: "offering", donor: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("recorded") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("typed donor name is passed through", async () => {
    await drive([{ text: "10,000" }, { buttonId: "rg_tithe" }, { text: "Bro John" }, { buttonId: "rg_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ amount: 10000, givingType: "tithe", donor: "Bro John" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("cancel records nothing", async () => {
    const { out, session } = await drive([{ text: "5000" }, { buttonId: "rg_offering" }, { buttonId: "rg_anon" }, { buttonId: "rg_cancel" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("nothing recorded") });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
  it("invalid amount reprompts", async () => {
    const { out, session } = await drive([{ text: "abc" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("valid amount") });
    expect(session.activeFlow).toMatchObject({ step: "amount" });
  });

  it("SECURITY: a plain member is blocked at commit (rank-gated tool) — nothing recorded", async () => {
    const { session } = await drive([{ text: "5000" }, { buttonId: "rg_offering" }, { buttonId: "rg_anon" }, { buttonId: "rg_go" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
