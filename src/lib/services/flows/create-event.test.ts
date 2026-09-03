import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { createEventFlow } from "@/lib/services/flows/create-event";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "create_event" ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 3, mutates: true, handler: handlerMock } : undefined,
}));
function harness(role = "pastor") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "P", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "pastor") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("create_event", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(createEventFlow); handlerMock.mockResolvedValue({ message: "✅ Event created." }); });

describe("create_event flow", () => {
  it("title → date → venue → confirm creates", async () => {
    await drive([{ text: "Youth Camp" }, { text: "2026-12-20" }, { text: "Main Hall" }, { buttonId: "ev_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "Youth Camp", date: "2026-12-20", venue: "Main Hall" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("skips date and venue", async () => {
    await drive([{ text: "Vigil" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "ev_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "Vigil", date: undefined, venue: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("SECURITY: a member is blocked at commit", async () => {
    const { session } = await drive([{ text: "Vigil" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "ev_go" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
