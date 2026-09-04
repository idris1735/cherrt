import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { createClassroomFlow } from "@/lib/services/flows/create-classroom";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "create_classroom" ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 4, mutates: true, handler: handlerMock } : undefined,
}));
function harness(role = "pastor") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "P", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "pastor") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("create_classroom", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(createClassroomFlow); handlerMock.mockResolvedValue({ message: "✅ Classroom created." }); });

describe("create_classroom flow", () => {
  it("name → capacity commits", async () => {
    await drive([{ text: "Nursery" }, { text: "15" }]);
    expect(handlerMock).toHaveBeenCalledWith({ name: "Nursery", capacity: 15 }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("No limit → capacity undefined", async () => {
    await drive([{ text: "Primary" }, { buttonId: "cl_nolimit" }]);
    expect(handlerMock).toHaveBeenCalledWith({ name: "Primary", capacity: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("SECURITY: a member is blocked at commit", async () => {
    const { session } = await drive([{ text: "Nursery" }, { buttonId: "cl_nolimit" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
