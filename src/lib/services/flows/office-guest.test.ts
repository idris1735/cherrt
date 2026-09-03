import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { officeGuestFlow } from "@/lib/services/flows/office-guest";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "register_office_guest" ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 2, mutates: true, handler: handlerMock } : undefined,
}));
function harness(role = "secretary") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "S", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "secretary") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("office_guest", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(officeGuestFlow); handlerMock.mockResolvedValue({ message: "✅ Signed in. Code 123456" }); });

describe("office_guest flow", () => {
  it("name → host → purpose signs in", async () => {
    await drive([{ text: "Jane Doe" }, { text: "Pastor Ada" }, { text: "Counselling" }]);
    expect(handlerMock).toHaveBeenCalledWith({ name: "Jane Doe", host: "Pastor Ada", purpose: "Counselling" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("skips host + purpose", async () => {
    await drive([{ text: "Jane Doe" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }]);
    expect(handlerMock).toHaveBeenCalledWith({ name: "Jane Doe", host: undefined, purpose: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("SECURITY: a member is blocked at commit", async () => {
    const { session } = await drive([{ text: "Jane Doe" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
