import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { lostFoundFlow } from "@/lib/services/flows/lost-found";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "report_lost_or_found" ? { name, description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock } : undefined,
}));
const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("lost_found", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(lostFoundFlow); handlerMock.mockResolvedValue({ message: "✅ Logged." }); });

describe("lost_found flow", () => {
  it("lost → describe → skip location commits kind=lost", async () => {
    const { out, session } = await drive([{ buttonId: "lf_lost" }, { text: "black umbrella" }, { buttonId: "flow_skip" }]);
    expect(handlerMock).toHaveBeenCalledWith({ description: "black umbrella", location: undefined, kind: "lost" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text" });
    expect(session.activeFlow).toBeUndefined();
  });
  it("found → describe → typed location commits kind=found", async () => {
    await drive([{ buttonId: "lf_found" }, { text: "a phone" }, { text: "car park" }]);
    expect(handlerMock).toHaveBeenCalledWith({ description: "a phone", location: "car park", kind: "found" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("off-list tap at kind reprompts", async () => {
    const { out, session } = await drive([{ text: "hi" }]);
    expect(out).toMatchObject({ type: "buttons" });
    expect(session.activeFlow).toMatchObject({ step: "kind" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
