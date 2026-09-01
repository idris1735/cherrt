import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { recordServiceFlow } from "@/lib/services/flows/record-service";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "record_service_summary"
      ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 2, mutates: true, handler: handlerMock }
      : undefined,
}));

function harness(role = "pastor") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Sec", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, update, ctx };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "pastor") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("service_record", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(recordServiceFlow); handlerMock.mockResolvedValue({ message: "✅ Service report saved." }); });

const skipRest = [{ buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }, { buttonId: "flow_skip" }]; // children..topic

describe("service_record flow", () => {
  it("type → adults → skip the rest → save commits with adults only", async () => {
    const { out, session } = await drive([{ buttonId: "st_sunday" }, { text: "120" }, ...skipRest, { buttonId: "sr_go" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ serviceType: "Sunday Service", adults: 120, children: undefined, offering: undefined, preacher: undefined }),
      expect.objectContaining({ workspaceId: "ws1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("saved") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("captures the numbers and text that are provided", async () => {
    await drive([
      { buttonId: "st_sunday" }, { text: "120" }, { text: "30" }, { text: "5" }, { text: "3" }, { text: "50000" }, { text: "Pastor Ada" }, { text: "Faith" }, { buttonId: "sr_go" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ adults: 120, children: 30, firstTimers: 5, salvations: 3, offering: 50000, preacher: "Pastor Ada", topic: "Faith" }),
      expect.anything(),
    );
  });

  it("invalid adults reprompts", async () => {
    const { out, session } = await drive([{ buttonId: "st_sunday" }, { text: "lots" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("number") });
    expect(session.activeFlow).toMatchObject({ step: "adults" });
  });

  it("SECURITY: a plain member is blocked at commit — nothing saved", async () => {
    const { session } = await drive([{ buttonId: "st_sunday" }, { text: "120" }, ...skipRest, { buttonId: "sr_go" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
