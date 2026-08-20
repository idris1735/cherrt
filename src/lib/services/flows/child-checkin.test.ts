import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { childCheckinFlow } from "@/lib/services/flows/child-checkin";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "check_in_child"
      ? { name: "check_in_child", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
      : undefined,
}));

const link: PhoneLink = {
  phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "daystar",
  workspaceName: "Daystar", userName: "Ada", userRole: "member",
};

function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => {
    if (patch.activeFlow === undefined) session.activeFlow = undefined;
    else session.activeFlow = patch.activeFlow;
  };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, update, ctx };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(childCheckinFlow);
});

// Drives the flow turn-by-turn; returns the output of the last turn.
async function drive(turns: Array<{ text?: string; buttonId?: string }>): Promise<{ out: FlowOutput | null; session: WhatsAppSession }> {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("child_checkin", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

describe("child_checkin flow", () => {
  it("happy path: name → age → allergies → confirm(commit) calls check_in_child and ends", async () => {
    handlerMock.mockResolvedValue({ message: "✅ Timmy is checked in. Pickup code: *123456* — show this at collection." });
    const { out, session } = await drive([
      { text: "Timmy" },
      { text: "5" },
      { text: "peanuts" },
      { buttonId: "flow_commit" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { childName: "Timmy", age: 5, allergies: "peanuts" },
      expect.objectContaining({ workspaceId: "ws1", role: "member", userName: "Ada", phone: "2348012345678", personId: "p1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Pickup code: *123456*") });
    expect(out?.type === "text" ? out.text : "").toContain("Tap *Menu*");
    expect(session.activeFlow).toBeUndefined();
  });

  it("invalid age: stays on the age step with a stay output", async () => {
    const { out, session } = await drive([{ text: "Timmy" }, { text: "abc" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("between 0 and 18") });
    expect(session.activeFlow).toMatchObject({ step: "age", data: { childName: "Timmy" } });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("flow_skip sets age null; flow_none sets allergies null; both reach confirm", async () => {
    const { out, session } = await drive([{ text: "Zoe" }, { buttonId: "flow_skip" }, { buttonId: "flow_none" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("All correct?") });
    expect(session.activeFlow).toMatchObject({ step: "confirm", data: { childName: "Zoe", age: null, allergies: null } });
  });

  it("start over at confirm returns to child_name with cleared data", async () => {
    const { out, session } = await drive([{ text: "Zoe" }, { text: "4" }, { text: "none" }, { buttonId: "flow_restart" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("full name") });
    expect(session.activeFlow).toMatchObject({ step: "child_name", data: { childName: undefined, age: undefined, allergies: undefined } });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("an off-choice word at confirm asks again instead of committing", async () => {
    const { out, session } = await drive([{ text: "Zoe" }, { text: "4" }, { text: "none" }, { text: "maybe" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Start over") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("tool error: flow ends with the error surfaced and activeFlow cleared", async () => {
    handlerMock.mockResolvedValue({ error: "storage unavailable" });
    const { out, session } = await drive([{ text: "Zoe" }, { text: "4" }, { text: "none" }, { buttonId: "flow_commit" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("storage unavailable") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("a bad name asks again without advancing", async () => {
    const { out, session } = await drive([{ text: "42" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("child's name") });
    expect(session.activeFlow).toMatchObject({ step: "child_name" });
  });
});
