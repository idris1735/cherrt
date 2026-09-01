import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { eventRegisterFlow } from "@/lib/services/flows/event-register";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "register_for_event"
      ? { name, description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
      : undefined,
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
  let out: FlowOutput | null = await startFlow("event_register", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(eventRegisterFlow); });

describe("event_register flow", () => {
  it("registers when the tool finds a matching event", async () => {
    handlerMock.mockResolvedValue({ ok: true, message: "✅ You're registered for Youth Camp!" });
    const { out, session } = await drive([{ text: "Youth Camp" }]);
    expect(handlerMock).toHaveBeenCalledWith({ eventTitle: "Youth Camp" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("registered") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("stays on the rail when the event isn't found (found:false)", async () => {
    handlerMock.mockResolvedValue({ found: false, message: "I couldn't find an event called \"Xmas\"." });
    const { out, session } = await drive([{ text: "Xmas" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("couldn't find") });
    expect(session.activeFlow).toMatchObject({ step: "event_name" });
  });
});
