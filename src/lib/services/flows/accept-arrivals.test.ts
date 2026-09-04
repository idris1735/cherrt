import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { acceptArrivalsFlow } from "@/lib/services/flows/accept-arrivals";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock, pendingMock } = vi.hoisted(() => ({ handlerMock: vi.fn(), pendingMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "accept_arrival" ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: 1, dataSensitive: true, mutates: true, handler: handlerMock } : undefined,
}));
vi.mock("@/lib/services/children/checkins", () => ({ listPendingArrivals: pendingMock }));

function harness(role = "pastor") {
  const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "T", userRole: role };
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, role = "pastor") {
  const { session, update, ctx } = harness(role);
  let out: FlowOutput | null = await startFlow("accept_arrivals", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(acceptArrivalsFlow); handlerMock.mockResolvedValue({ message: "✅ in class" }); });

describe("accept_arrivals flow", () => {
  it("lists pending then accepts a child, looping until none remain", async () => {
    pendingMock
      .mockResolvedValueOnce([{ id: "c1", childName: "Timmy", classroom: "Nursery" }]) // start
      .mockResolvedValueOnce([]); // after accepting c1, none left
    const { out, session } = await drive([{ buttonId: "arrivals_go" }, { buttonId: "acc_0" }]);
    expect(handlerMock).toHaveBeenCalledWith({ checkinId: "c1" }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("in class") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("says nothing waiting when there are no pending arrivals", async () => {
    pendingMock.mockResolvedValue([]);
    const { out, session } = await drive([{ buttonId: "arrivals_go" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("No children waiting") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("SECURITY: a plain member is denied before any child PII is listed", async () => {
    const { out } = await drive([{ buttonId: "arrivals_go" }], "member");
    expect(pendingMock).not.toHaveBeenCalled(); // no PII fetched
    expect(out).toMatchObject({ type: "text" });
  });
});
