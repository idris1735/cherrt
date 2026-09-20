import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext, FlowData } from "@/lib/services/flows/engine";
import { childCheckinFlow } from "@/lib/services/flows/child-checkin";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock, classroomsMock } = vi.hoisted(() => ({ handlerMock: vi.fn(), classroomsMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "check_in_child"
      ? { name: "check_in_child", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
      : undefined,
}));
vi.mock("@/lib/services/children/classrooms", () => ({ listClassroomsWithOccupancy: classroomsMock }));

const link: PhoneLink = {
  phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "daystar",
  workspaceName: "Daystar", userName: "Ada", userRole: "member",
};

// The processor seeds the guardian's own registered children before starting.
const KIDS = [{ personId: "c1", name: "Timmy" }, { personId: "c2", name: "Zoe" }];

function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => {
    session.activeFlow = patch.activeFlow === undefined ? undefined : patch.activeFlow;
  };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, update, ctx };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(childCheckinFlow);
  classroomsMock.mockResolvedValue([]); // default: no classrooms → step skipped
});

async function drive(turns: Array<{ text?: string; buttonId?: string }>, seed: FlowData = { myChildren: KIDS }) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("child_checkin", ctx, update, seed);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}

describe("child_checkin flow", () => {
  it("opens with a list of the guardian's own children", async () => {
    const { out } = await drive([]);
    expect(out).toMatchObject({ type: "list", header: "Check in a child" });
    const ids = (out as { rows: Array<{ id: string; title: string }> }).rows.map((r) => r.title);
    expect(ids).toEqual(expect.arrayContaining(["Timmy", "Zoe"]));
  });

  it("happy path: pick child → age → allergies → confirm(commit) calls check_in_child", async () => {
    handlerMock.mockResolvedValue({ message: "✅ Timmy is checked in. Pickup code: *123456* — show this at collection." });
    const { out, session } = await drive([
      { buttonId: "pc_0" },
      { text: "5" },
      { text: "peanuts" },
      { buttonId: "flow_commit" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { childName: "Timmy", age: 5, allergies: "peanuts", classroomId: undefined },
      expect.objectContaining({ workspaceId: "ws1", role: "member", userName: "Ada", phone: "2348012345678", personId: "p1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Pickup code: *123456*") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("age is REQUIRED — a Skip is no longer offered, and a non-number reprompts", async () => {
    const { out, session } = await drive([{ buttonId: "pc_0" }, { text: "abc" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("between 0 and 18") });
    expect(session.activeFlow).toMatchObject({ step: "age", data: { childName: "Timmy" } });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("allergies None reaches confirm with age set", async () => {
    const { out, session } = await drive([{ buttonId: "pc_1" }, { text: "4" }, { buttonId: "flow_none" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("All correct?") });
    expect(session.activeFlow).toMatchObject({ step: "confirm", data: { childName: "Zoe", age: 4, allergies: null } });
  });

  it("'a different child' points to registration and ends", async () => {
    const { out, session } = await drive([{ buttonId: "pc_new" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("register my child") });
    expect(session.activeFlow).toBeUndefined();
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("start over at confirm returns to the child picker with cleared data", async () => {
    const { out, session } = await drive([{ buttonId: "pc_1" }, { text: "4" }, { buttonId: "flow_none" }, { buttonId: "flow_restart" }]);
    expect(out).toMatchObject({ type: "list", header: "Check in a child" });
    expect(session.activeFlow).toMatchObject({ step: "pick_child", data: { childName: undefined, age: undefined } });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("tool error: flow ends with the error surfaced", async () => {
    handlerMock.mockResolvedValue({ error: "storage unavailable" });
    const { out, session } = await drive([{ buttonId: "pc_1" }, { text: "4" }, { buttonId: "flow_none" }, { buttonId: "flow_commit" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("storage unavailable") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("when classrooms exist, a room is picked and classroomId is passed to check-in", async () => {
    classroomsMock.mockResolvedValue([{ id: "A", name: "Nursery", capacity: 10, occupancy: 2, full: false }]);
    handlerMock.mockResolvedValue({ message: "✅ Timmy is checked in. Pickup code: *111111*" });
    const { out, session } = await drive([{ buttonId: "pc_0" }, { text: "5" }, { buttonId: "flow_none" }, { buttonId: "room_0" }, { buttonId: "flow_commit" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ childName: "Timmy", classroomId: "A" }),
      expect.objectContaining({ workspaceId: "ws1" }),
    );
    expect(out).toMatchObject({ type: "text" });
    expect(session.activeFlow).toBeUndefined();
  });

  it("a full classroom can't be picked", async () => {
    classroomsMock.mockResolvedValue([{ id: "A", name: "Nursery", capacity: 2, occupancy: 2, full: true }]);
    const { out, session } = await drive([{ buttonId: "pc_1" }, { text: "4" }, { buttonId: "flow_none" }, { buttonId: "room_0" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("full") });
    expect(session.activeFlow).toMatchObject({ step: "classroom" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
