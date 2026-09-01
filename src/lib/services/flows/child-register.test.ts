import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { childRegisterFlow } from "@/lib/services/flows/child-register";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "register_child"
      ? { name: "register_child", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
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
  registerFlow(childRegisterFlow);
});

async function drive(turns: Array<{ text?: string; buttonId?: string }>): Promise<{ out: FlowOutput | null; session: WhatsAppSession }> {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("child_register", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

describe("child_register flow", () => {
  it("happy path: name → age → allergies → consent → confirm calls register_child with guardianConsent:true", async () => {
    handlerMock.mockResolvedValue({ message: "✅ Registered *Timmy Obi* in the children's ministry." });
    const { out, session } = await drive([
      { text: "Timmy Obi" },
      { text: "5" },
      { text: "peanuts" },
      { buttonId: "consent_yes" },
      { buttonId: "flow_commit" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { childName: "Timmy Obi", guardianConsent: true, age: 5, allergies: "peanuts" },
      expect.objectContaining({ workspaceId: "ws1", role: "member", userName: "Ada", phone: "2348012345678", personId: "p1" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Registered") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("SAFETY: cancelling consent ends the flow and never registers", async () => {
    const { out, session } = await drive([
      { text: "Timmy Obi" }, { buttonId: "flow_skip" }, { buttonId: "flow_none" }, { buttonId: "consent_no" },
    ]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("nothing was saved") });
    expect(session.activeFlow).toBeUndefined();
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("SAFETY: an ambiguous reply at consent re-asks — never proceeds without a clear confirm", async () => {
    const { out, session } = await drive([
      { text: "Timmy Obi" }, { buttonId: "flow_skip" }, { buttonId: "flow_none" }, { text: "ok maybe" },
    ]);
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("parent/guardian") });
    expect(session.activeFlow).toMatchObject({ step: "consent" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("skip age + none allergies still reaches consent", async () => {
    const { out, session } = await drive([{ text: "Zoe Ade" }, { buttonId: "flow_skip" }, { buttonId: "flow_none" }]);
    expect(out).toMatchObject({ type: "buttons", header: "Guardian consent" });
    expect(session.activeFlow).toMatchObject({ step: "consent", data: { childName: "Zoe Ade", age: null, allergies: null } });
  });

  it("start over at confirm clears data (including consent) back to child_name", async () => {
    const { out, session } = await drive([
      { text: "Zoe Ade" }, { text: "4" }, { buttonId: "flow_none" }, { buttonId: "consent_yes" }, { buttonId: "flow_restart" },
    ]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("full name") });
    expect(session.activeFlow).toMatchObject({ step: "child_name", data: { guardianConsent: undefined } });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("tool error surfaces and clears the flow", async () => {
    handlerMock.mockResolvedValue({ error: "storage unavailable" });
    const { out, session } = await drive([
      { text: "Zoe Ade" }, { buttonId: "flow_skip" }, { buttonId: "flow_none" }, { buttonId: "consent_yes" }, { buttonId: "flow_commit" },
    ]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("storage unavailable") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("a bad name asks again without advancing", async () => {
    const { out, session } = await drive([{ text: "42" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("child's name") });
    expect(session.activeFlow).toMatchObject({ step: "child_name" });
  });
});
