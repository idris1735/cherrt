import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { convertFirstTimerFlow } from "@/lib/services/flows/convert-first-timer";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "convert_first_timer" ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 4, mutates: true, handler: handlerMock } : undefined,
}));
function harness(role = "pastor") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "P", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "pastor") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("convert_first_timer", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(convertFirstTimerFlow); handlerMock.mockResolvedValue({ message: "✅ Ada is now a member." }); });

describe("convert_first_timer flow", () => {
  it("name → convert", async () => {
    const { out, session } = await drive([{ text: "Ada Obi" }]);
    expect(handlerMock).toHaveBeenCalledWith({ name: "Ada Obi" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("member") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("not-found keeps them on the rail to retry", async () => {
    handlerMock.mockResolvedValue({ error: 'No first-timer named "Zed" found.' });
    const { out, session } = await drive([{ text: "Zed" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("No first-timer") });
    expect(session.activeFlow).toMatchObject({ step: "name" });
  });
  it("SECURITY: a plain member is blocked (rank-gated)", async () => {
    const { session } = await drive([{ text: "Ada Obi" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
