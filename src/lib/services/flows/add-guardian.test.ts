import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext, FlowData } from "@/lib/services/flows/engine";
import { addGuardianFlow } from "@/lib/services/flows/add-guardian";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "add_guardian"
    ? { name, description: "", parameters: { type: "object", properties: {} }, requiresConfirmation: true, mutates: true, handler: handlerMock }
    : undefined,
}));
const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };

// The processor seeds the guardian's own registered children before starting.
const KIDS = [{ personId: "c1", name: "Timmy Obi" }, { personId: "c2", name: "Zoe Ade" }];

function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, seed: FlowData = { myChildren: KIDS }) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("add_guardian", ctx, update, seed);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(addGuardianFlow); handlerMock.mockResolvedValue({ message: "✅ John Obi can now collect Timmy Obi." }); });

describe("add_guardian flow", () => {
  it("opens with a list of the guardian's own children (a selection, not a typed name)", async () => {
    const { out } = await drive([]);
    expect(out).toMatchObject({ type: "list", header: "Authorise pickup" });
    const titles = (out as { rows: Array<{ title: string }> }).rows.map((r) => r.title);
    expect(titles).toEqual(expect.arrayContaining(["Timmy Obi", "Zoe Ade"]));
  });

  it("pick child → name → phone → AUTHORISE calls add_guardian with the details", async () => {
    const { out, session } = await drive([
      { buttonId: "ag_child_0" },
      { text: "John Obi" },
      { text: "08033334444" },
      { text: "AUTHORISE" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { childName: "Timmy Obi", guardianName: "John Obi", guardianPhone: "08033334444" },
      expect.objectContaining({ workspaceId: "ws1", personId: "p1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("collect") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("security step: anything other than AUTHORISE re-asks and does not grant", async () => {
    const { out, session } = await drive([{ buttonId: "ag_child_0" }, { text: "John Obi" }, { text: "08033334444" }, { text: "yes" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("AUTHORISE") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("rejects an obviously-bad phone number", async () => {
    const { out, session } = await drive([{ buttonId: "ag_child_0" }, { text: "John Obi" }, { text: "123" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("full number") });
    expect(session.activeFlow).toMatchObject({ step: "phone" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("cancel makes no change (engine-level cancel ends the flow)", async () => {
    const { out, session } = await drive([{ buttonId: "ag_child_0" }, { text: "John Obi" }, { text: "08033334444" }, { text: "cancel" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Nothing was saved") });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });

  it("on a tool error, surfaces it and offers a retry instead of ending the flow", async () => {
    handlerMock.mockResolvedValue({ error: "That number is already authorised." });
    const { out, session } = await drive([{ buttonId: "ag_child_0" }, { text: "John Obi" }, { text: "08033334444" }, { text: "AUTHORISE" }]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("already authorised") });
    expect((out?.type === "buttons" ? out.buttons.map((b) => b.id) : [])).toEqual(["ag_retry", "ag_cancel"]);
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
  });

  it("Try again after an error restarts from the child picker", async () => {
    handlerMock.mockResolvedValueOnce({ error: "Something went wrong." });
    const { out, session } = await drive([
      { buttonId: "ag_child_0" }, { text: "John Obi" }, { text: "08033334444" }, { text: "AUTHORISE" }, { buttonId: "ag_retry" },
    ]);
    expect(out).toMatchObject({ type: "list", header: "Authorise pickup" });
    expect(session.activeFlow).toMatchObject({ step: "pick_child", data: { childName: undefined, guardianName: undefined, guardianPhone: undefined } });
  });
});
