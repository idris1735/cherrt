import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { addMemberFlow } from "@/lib/services/flows/add-member";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "add_member"
      ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 4, mutates: true, handler: handlerMock }
      : undefined,
}));

function harness(role = "senior_pastor") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Pastor", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, update, ctx };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "senior_pastor") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("add_member", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(addMemberFlow); handlerMock.mockResolvedValue({ message: "✅ Added Sam Eze." }); });

describe("add_member flow", () => {
  it("name → skip phone → role → confirm adds", async () => {
    const { out, session } = await drive([{ text: "Sam Eze" }, { buttonId: "flow_skip" }, { buttonId: "am_member" }, { buttonId: "am_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ name: "Sam Eze", role: "member", phone: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Added") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("typed phone + chosen role are passed", async () => {
    await drive([{ text: "Ada Obi" }, { text: "08031234567" }, { buttonId: "am_finance" }, { buttonId: "am_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ name: "Ada Obi", role: "finance", phone: "08031234567" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("SECURITY: a plain member is blocked at commit — nobody added", async () => {
    const { session } = await drive([{ text: "Sam Eze" }, { buttonId: "flow_skip" }, { buttonId: "am_member" }, { buttonId: "am_go" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
