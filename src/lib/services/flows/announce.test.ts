import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { announceFlow } from "@/lib/services/flows/announce";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "create_announcement"
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
  let out: FlowOutput | null = await startFlow("announce", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(announceFlow); handlerMock.mockResolvedValue({ message: "✅ Announcement sent." }); });

describe("announce flow", () => {
  it("title → message → confirm broadcasts", async () => {
    const { out, session } = await drive([{ text: "Service at 9am" }, { text: "Please arrive early tomorrow." }, { buttonId: "ann_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ title: "Service at 9am", message: "Please arrive early tomorrow." }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("sent") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("cancel sends nothing", async () => {
    const { out } = await drive([{ text: "X" + "yz" }, { text: "hello all" }, { buttonId: "ann_cancel" }]);
    expect(handlerMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("nothing was sent") });
  });
  it("SECURITY: a plain member is blocked at commit — no broadcast", async () => {
    const { session } = await drive([{ text: "Service at 9am" }, { text: "Arrive early." }, { buttonId: "ann_go" }], "member");
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
});
