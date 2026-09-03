import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext } from "@/lib/services/flows/engine";
import { setBirthdayFlow, parseBirthday } from "@/lib/services/flows/set-birthday";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) => name === "set_birthday" ? { name, description: "", parameters: { type: "object", properties: {} }, mutates: true, handler: handlerMock } : undefined,
}));
const link: PhoneLink = { phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Ada", userRole: "member" };
function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "2348012345678", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("set_birthday", ctx, update);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(setBirthdayFlow); handlerMock.mockResolvedValue({ message: "🎂 Saved!" }); });

describe("parseBirthday", () => {
  it("parses common formats", () => {
    expect(parseBirthday("12 May")).toEqual({ day: 12, month: 5 });
    expect(parseBirthday("May 12")).toEqual({ day: 12, month: 5 });
    expect(parseBirthday("12/05")).toEqual({ day: 12, month: 5 });
    expect(parseBirthday("1-1")).toEqual({ day: 1, month: 1 });
    expect(parseBirthday("32/13")).toBeNull();
    expect(parseBirthday("sometime")).toBeNull();
  });
});

describe("set_birthday flow", () => {
  it("parses '12 May' and commits day+month", async () => {
    const { out, session } = await drive([{ text: "12 May" }]);
    expect(handlerMock).toHaveBeenCalledWith({ day: 12, month: 5 }, expect.objectContaining({ workspaceId: "ws1" }));
    expect(out).toMatchObject({ type: "text" });
    expect(session.activeFlow).toBeUndefined();
  });
  it("reprompts on an unparseable date", async () => {
    const { out, session } = await drive([{ text: "next week" }]);
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("didn't catch") });
    expect(session.activeFlow).toMatchObject({ step: "date" });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
