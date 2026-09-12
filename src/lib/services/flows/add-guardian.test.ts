import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { addGuardianFlow } from "@/lib/services/flows/add-guardian";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "add_guardian"
    ? { name, description: "", parameters: { type: "object", properties: {} }, requiresConfirmation: true, mutates: true, handler: handlerMock }
    : undefined,
}));
const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("add_guardian", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(addGuardianFlow); handlerMock.mockResolvedValue({ message: "✅ Dad can now collect Timmy." }); });

describe("add_guardian flow", () => {
  it("child → name → phone → confirm calls add_guardian with the details", async () => {
    const { out, session } = await drive([
      { text: "Timmy Obi" },
      { text: "John Obi" },
      { text: "08033334444" },
      { buttonId: "ag_go" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { childName: "Timmy Obi", guardianName: "John Obi", guardianPhone: "08033334444" },
      expect.objectContaining({ workspaceId: "ws1", personId: "p1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("collect") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("rejects an obviously-bad phone number", async () => {
    const { out, session } = await drive([{ text: "Timmy Obi" }, { text: "John Obi" }, { text: "123" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("full number") });
    expect(session.activeFlow).toMatchObject({ step: "phone" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("surfaces the tool's guardian-gate error verbatim", async () => {
    handlerMock.mockResolvedValue({ error: "I couldn't find a child named \"Timmy\" that you're a registered guardian of." });
    const { out } = await drive([{ text: "Timmy" }, { text: "John" }, { text: "08033334444" }, { buttonId: "ag_go" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("registered guardian") });
  });

  it("cancel makes no change", async () => {
    const { out, session } = await drive([{ text: "Timmy" }, { text: "John" }, { text: "08033334444" }, { buttonId: "ag_cancel" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("no change") });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
