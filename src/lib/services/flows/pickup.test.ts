import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { pickupFlow } from "@/lib/services/flows/pickup";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "release_child" ? { name, description: "", parameters: { type: "object", properties: {} }, requiresConfirmation: true, mutates: true, handler: handlerMock } : undefined,
}));
const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("pickup", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(pickupFlow); handlerMock.mockResolvedValue({ message: "✅ Timmy has been released to their registered guardian." }); });

describe("pickup flow", () => {
  it("code → confirm → release_child with the code", async () => {
    const { out, session } = await drive([{ text: "123456" }, { buttonId: "pu_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ pickupCode: "123456" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("released") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("surfaces the guardian-gate error (code alone can't collect)", async () => {
    handlerMock.mockResolvedValue({ error: "I can only release this child to their registered guardian." });
    const { out } = await drive([{ text: "123456" }, { buttonId: "pu_go" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("registered guardian") });
  });
  it("a non-numeric code reprompts", async () => {
    const { out, session } = await drive([{ text: "abcd" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("pickup code") });
    expect(session.activeFlow).toMatchObject({ step: "code" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
