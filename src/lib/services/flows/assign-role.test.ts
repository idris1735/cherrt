import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowOutput, FlowRunContext, FlowData } from "@/lib/services/flows/engine";
import { assignRoleFlow } from "@/lib/services/flows/assign-role";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

const { setRoleMock } = vi.hoisted(() => ({ setRoleMock: vi.fn() }));
vi.mock("@/lib/services/identity/provisioning", () => ({ setMembershipRole: setRoleMock }));
// canAssignRole is real (that's the guard we want exercised).

const link: PhoneLink = { phoneNumber: "234801", userId: null, workspaceId: "ws1", workspaceSlug: "d", workspaceName: "Daystar", userName: "Pastor", userRole: "pastor" };
const SEED: FlowData = {
  candidates: [{ personId: "m1", fullName: "Ada Obi", role: "member" }, { personId: "m2", fullName: "Sam Eze", role: "secretary" }],
  roleOptions: ["pastor", "finance", "secretary", "children", "dept_leader", "member"],
};

function harness() {
  const session = { phoneNumber: "234801", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => { session.activeFlow = patch.activeFlow ?? undefined; };
  return { session, update, ctx: { phone: "234801", link, personId: "p1", session } as FlowRunContext };
}
async function drive(turns: Array<{ text?: string; buttonId?: string }>, seed = SEED) {
  const { session, update, ctx } = harness();
  let out: FlowOutput | null = await startFlow("assign_role", ctx, update, seed);
  for (const t of turns) out = await advanceFlow({ text: t.text ?? "", buttonId: t.buttonId }, ctx, update);
  return { out, session };
}
beforeEach(() => { vi.clearAllMocks(); registerFlow(assignRoleFlow); setRoleMock.mockResolvedValue(true); });

describe("assign_role flow", () => {
  it("opens with a tappable member list (not plain text)", async () => {
    const { out } = await drive([]);
    expect(out).toMatchObject({ type: "list", header: "Change a role" });
    expect((out as { rows: Array<{ title: string }> }).rows.map((r) => r.title)).toEqual(expect.arrayContaining(["Ada Obi", "Sam Eze"]));
  });

  it("member → role → confirm calls setMembershipRole", async () => {
    const { out, session } = await drive([{ buttonId: "am_0" }, { buttonId: "ar_1" }, { buttonId: "ar_go" }]);
    expect(setRoleMock).toHaveBeenCalledWith("m1", "ws1", "finance");
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("is now finance") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("cancel at confirm makes no change", async () => {
    const { out, session } = await drive([{ buttonId: "am_1" }, { buttonId: "ar_0" }, { buttonId: "ar_cancel" }]);
    expect(setRoleMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("No change") });
    expect(session.activeFlow).toBeUndefined();
  });

  it("role step is a tappable list too", async () => {
    const { out } = await drive([{ buttonId: "am_0" }]);
    expect(out).toMatchObject({ type: "list", text: expect.stringContaining("Ada Obi") });
  });
});
