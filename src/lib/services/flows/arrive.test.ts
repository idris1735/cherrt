import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { arriveFlow } from "@/lib/services/flows/arrive";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { heldMock, arriveMock } = vi.hoisted(() => ({ heldMock: vi.fn(), arriveMock: vi.fn() }));
vi.mock("@/lib/services/children/checkins", () => ({ listHeldForGuardian: heldMock, arriveHeld: arriveMock }));

const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("arrive", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(arriveFlow); });

describe("arrive flow", () => {
  it("auto-converts a single held seat", async () => {
    heldMock.mockResolvedValue([{ id: "c1", childName: "Timmy", classroom: "Nursery", pickupCode: "111111" }]);
    arriveMock.mockResolvedValue({ ok: true, childName: "Timmy", pickupCode: "111111" });
    const { out, session } = await drive([{ buttonId: "arrive_go" }]);
    expect(arriveMock).toHaveBeenCalledWith("ws1", "c1");
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("111111") });
    expect(session.activeFlow).toBeUndefined();
  });
  it("with several held seats, offers a pick then converts the chosen one", async () => {
    heldMock.mockResolvedValue([
      { id: "c1", childName: "Timmy", classroom: "Nursery", pickupCode: "111111" },
      { id: "c2", childName: "Zoe", classroom: "Primary", pickupCode: "222222" },
    ]);
    arriveMock.mockResolvedValue({ ok: true, childName: "Zoe", pickupCode: "222222" });
    const { out } = await drive([{ buttonId: "arrive_go" }, { buttonId: "arr_1" }]);
    expect(arriveMock).toHaveBeenCalledWith("ws1", "c2");
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("222222") });
  });
  it("no held seats → points to walk-in check-in", async () => {
    heldMock.mockResolvedValue([]);
    const { out } = await drive([{ buttonId: "arrive_go" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Check in a child") });
    expect(arriveMock).not.toHaveBeenCalled();
  });
});
