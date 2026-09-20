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
  it("requires name and date, then confirm, then submits", async () => {
    const { out, session } = await drive([
      { buttonId: "pf_baby_dedication" },
      { text: "Baby Ada Obi" },
      { text: "28 September" },
      { buttonId: "flow_skip" },   // notes optional
      { buttonId: "pf_go" },       // confirm
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { formType: "baby_dedication", details: "Name: Baby Ada Obi; Date: 28 September" },
      expect.objectContaining({ workspaceId: "ws1", userName: "Ada" }),
    );
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("submitted") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("does NOT submit on the notes Skip — it goes to a confirm first (regression)", async () => {
    const { out, session } = await drive([
      { buttonId: "pf_child_naming" },
      { text: "Baby John" },
      { text: "next Sunday" },
      { buttonId: "flow_skip" },
    ]);
    expect(handlerMock).not.toHaveBeenCalled();               // nothing submitted yet
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Submit this?") });
    expect(session.activeFlow).toMatchObject({ step: "confirm" });
  });

  it("name is required — an empty name reprompts, never advances", async () => {
    const { out, session } = await drive([{ buttonId: "pf_house_dedication" }, { text: "" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("full name") });
    expect(session.activeFlow).toMatchObject({ step: "subject_name" });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("notes are included when typed", async () => {
    await drive([
      { buttonId: "pf_pre_marital" },
      { text: "John and Mary" },
      { text: "December" },
      { text: "Wedding is in December" },
      { buttonId: "pf_go" },
    ]);
    expect(handlerMock).toHaveBeenCalledWith(
      { formType: "pre_marital", details: "Name: John and Mary; Date: December; Notes: Wedding is in December" },
      expect.objectContaining({ workspaceId: "ws1" }),
    );
  });

  it("cancel at confirm submits nothing", async () => {
    const { out, session } = await drive([
      { buttonId: "pf_baby_dedication" }, { text: "Ada" }, { text: "today" }, { buttonId: "flow_skip" }, { buttonId: "pf_cancel" },
    ]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("nothing submitted") });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(session.activeFlow).toBeUndefined();
  });

  it("an off-list tap at form_type reprompts and never submits", async () => {
    const { out, session } = await drive([{ text: "something" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("forms") });
    expect(session.activeFlow).toMatchObject({ step: "form_type" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
