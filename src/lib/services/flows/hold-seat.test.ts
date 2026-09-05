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
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("hold_seat", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(holdSeatFlow); handlerMock.mockResolvedValue({ message: "✅ Seat reserved." }); classroomsMock.mockResolvedValue([]); });

describe("hold_seat flow", () => {
  it("no classrooms → reserves with name only", async () => {
    const { out, session } = await drive([{ text: "Timmy Obi" }]);
    expect(handlerMock).toHaveBeenCalledWith({ childName: "Timmy Obi", classroomId: undefined }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text" });
    expect(session.activeFlow).toBeUndefined();
  });
  it("with classrooms → name → pick room → reserve with classroomId", async () => {
    classroomsMock.mockResolvedValue([{ id: "A", name: "Nursery", capacity: 10, occupancy: 1, full: false }]);
    await drive([{ text: "Zoe Ade" }, { buttonId: "room_0" }]);
    expect(handlerMock).toHaveBeenCalledWith({ childName: "Zoe Ade", classroomId: "A" }, expect.objectContaining({ workspaceId: "ws1" }));
  });
  it("a full room can't be reserved", async () => {
    classroomsMock.mockResolvedValue([{ id: "A", name: "Nursery", capacity: 2, occupancy: 2, full: true }]);
    const { out, session } = await drive([{ text: "Zoe Ade" }, { buttonId: "room_0" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("full") });
    expect(session.activeFlow).toMatchObject({ step: "classroom" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
