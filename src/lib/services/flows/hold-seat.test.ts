import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { holdSeatFlow } from "@/lib/services/flows/hold-seat";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock, classroomsMock } = vi.hoisted(() => ({ handlerMock: vi.fn(), classroomsMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "hold_seat" ? { name, description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock } : undefined,
}));
vi.mock("@/lib/services/children/classrooms", () => ({ listClassroomsWithOccupancy: classroomsMock }));

const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
// Seeded by startHoldSeat (processor) with the guardian's OWN registered
// children — the flow no longer takes a free-text name.
const kids = [{ personId: "k1", name: "Timmy Obi" }, { personId: "k2", name: "Zoe Ade" }];
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, seed: Record<string, unknown> = { myChildren: kids }) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("hold_seat", ctx, update, seed);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(holdSeatFlow); handlerMock.mockResolvedValue({ message: "✅ Seat reserved." }); classroomsMock.mockResolvedValue([]); });

describe("hold_seat flow", () => {
  it("opens with the guardian's registered children, not a free-text name prompt", async () => {
    const { out } = await drive([]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("Which of your children") });
    const ids = ((out as { rows: Array<{ id: string }> }).rows).map((r) => r.id);
    expect(ids).toEqual(["pc_0", "pc_1", "pc_new"]);
  });
  it("no classrooms → pick child → confirm → reserves bound to the child's person id", async () => {
    const { out, session } = await drive([{ buttonId: "pc_0" }, { buttonId: "hs_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ childName: "Timmy Obi", childPersonId: "k1", classroomId: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text" });
    expect(session.activeFlow).toBeUndefined();
  });
  it("with classrooms → pick child → pick room → confirm → reserve with classroomId + person id", async () => {
    classroomsMock.mockResolvedValue([{ id: "A", name: "Nursery", capacity: 10, occupancy: 1, full: false }]);
    await drive([{ buttonId: "pc_1" }, { buttonId: "room_0" }, { buttonId: "hs_go" }]);
    expect(handlerMock).toHaveBeenCalledWith({ childName: "Zoe Ade", childPersonId: "k2", classroomId: "A" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("picking a child asks for confirmation before reserving (no accidental hold)", async () => {
    const { out, session } = await drive([{ buttonId: "pc_0" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Reserve a seat for") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
  it("cancel at confirm reserves nothing", async () => {
    const { session } = await drive([{ buttonId: "pc_0" }, { buttonId: "hs_cancel" }]);
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });
  it("'a different child' dead-ends to registration, never a free-text reservation", async () => {
    const { out, session } = await drive([{ buttonId: "pc_new" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("register my child") });
    expect(session.activeFlow).toBeUndefined();
    expect(handlerMock).not.toHaveBeenCalled();
  });
  it("a full room can't be reserved", async () => {
    classroomsMock.mockResolvedValue([{ id: "A", name: "Nursery", capacity: 2, occupancy: 2, full: true }]);
    const { out, session } = await drive([{ buttonId: "pc_1" }, { buttonId: "room_0" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("full") });
    expect(session.activeFlow).toMatchObject({ step: "classroom" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
