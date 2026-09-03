import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { volunteerSignupFlow } from "@/lib/services/flows/volunteer-signup";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "volunteer_signup" ? { name, description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock } : undefined,
}));
const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("volunteer_signup", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(volunteerSignupFlow); handlerMock.mockResolvedValue({ message: "🙌 Signed up!" }); });

describe("volunteer_signup flow", () => {
  it("passes the typed team/role to volunteer_signup", async () => {
    const { out, session } = await drive([{ text: "choir" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "choir" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text" });
    expect(session.activeFlow).toBeUndefined();
  });
  it("reprompts on empty input", async () => {
    const { out, session } = await drive([{ text: "x" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("which team") });
    expect(session.activeFlow).toMatchObject({ step: "what" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
