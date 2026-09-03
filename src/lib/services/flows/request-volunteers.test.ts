import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { requestVolunteersFlow } from "@/lib/services/flows/request-volunteers";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "request_volunteers" ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 3, mutates: true, handler: handlerMock } : undefined,
}));
function harness(role = "pastor") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "P", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "pastor") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("request_volunteers", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(requestVolunteersFlow); handlerMock.mockResolvedValue({ message: "✅ Posted." }); });

describe("request_volunteers flow", () => {
  it("title → when → slots → confirm posts", async () => {
    await drive([{ text: "Ushers for the vigil" }, { text: "Friday 6pm" }, { text: "8" }, { buttonId: "rv_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "Ushers for the vigil", when: "Friday 6pm", slots: 8 }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("skips when + slots", async () => {
    await drive([{ text: "Choir" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "rv_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "Choir", when: undefined, slots: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("SECURITY: a member is blocked at commit", async () => {
    const { session } = await drive([{ text: "Choir" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "rv_go" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
