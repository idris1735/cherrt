import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { reportIssueFlow } from "@/lib/services/flows/report-issue";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "report_issue"
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
  let out: FlowOutput | null = await startFlow("issue", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(reportIssueFlow); handlerMock.mockResolvedValue({ message: "✅ Logged — thank you." }); });

describe("issue flow", () => {
  it("title → skip area → severity commits with high", async () => {
    const { out, session } = await drive([{ text: "Toilet not flushing" }, { buttonId: "flow_skip" }, { buttonId: "sev_high" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "Toilet not flushing", area: undefined, severity: "high" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Logged") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("typed area is passed through", async () => {
    await drive([{ text: "Leaking roof" }, { text: "Main hall" }, { buttonId: "sev_medium" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "Leaking roof", area: "Main hall", severity: "medium" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("too-short title reprompts", async () => {
    const { out, session } = await drive([{ text: "x" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("short description") });
    expect(session.activeFlow).toMatchObject({ step: "title" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
