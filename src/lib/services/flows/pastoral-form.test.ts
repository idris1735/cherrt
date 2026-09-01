import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { pastoralFormFlow } from "@/lib/services/flows/pastoral-form";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name === "submit_pastoral_form"
      ? { name: "submit_pastoral_form", description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock }
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

async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("pastoral_form", ctx, update);
  for (const t of turns) {
    out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  }
  return { out, session };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(pastoralFormFlow);
  handlerMock.mockResolvedValue({ message: "✅ Your Baby Dedication form has been submitted. A pastor will follow up." });
});

describe("pastoral_form flow", () => {
  it("happy path: pick form → skip details → submits with formType only", async () => {
    const { out, session } = await drive([{ buttonId: "pf_baby_dedication" }, { buttonId: "flow_skip" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { formType: "baby_dedication", details: undefined },
      expect.objectContaining({ workspaceId: "ws1", userName: "Ada" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("submitted") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("typed details are passed through", async () => {
    await drive([{ buttonId: "pf_pre_marital" }, { text: "Wedding is in December" }]);
    expect(handlerMock).toHaveBeenCalledWith(
      { formType: "pre_marital", details: "Wedding is in December" },
      expect.objectContaining({ workspaceId: "ws1" }),
    );
  });

  it("the details header reflects the chosen form", async () => {
    const { out, session } = await drive([{ buttonId: "pf_house_dedication" }]);
    expect(out).toMatchObject({ type: "buttons", header: "House Dedication" });
    expect(session.activeFlow).toMatchObject({ step: "details", data: { formType: "house_dedication" } });
  });

  it("an off-list tap at form_type reprompts and never submits", async () => {
    const { out, session } = await drive([{ text: "something" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("forms") });
    expect(session.activeFlow).toMatchObject({ step: "form_type" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
