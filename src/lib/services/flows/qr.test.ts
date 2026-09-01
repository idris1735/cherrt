import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { qrFlow } from "@/lib/services/flows/qr";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "send_qr" ? { name, description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock } : undefined,
}));

const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, update, ctx };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("qr", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(qrFlow); handlerMock.mockResolvedValue({ message: "Sent! 📲" }); });

describe("qr flow", () => {
  it("picking a QR kind calls send_qr with that kind", async () => {
    const { out, session } = await drive([{ buttonId: "qr_give" }]);
    expect(handlerMock).toHaveBeenCalledWith({ kind: "give" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Sent") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("off-list tap reprompts", async () => {
    const { out, session } = await drive([{ text: "hi" }]);
    expect(out).toMatchObject({ type: "list" });
    expect(session.activeFlow).toMatchObject({ step: "kind" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
