// Assign-role rail — an authorised admin changes a member's role by TAPPING a
// member, then a role, then confirming (was a plain-text numbered list; client
// feedback 2026-09-12). Seeded by startAssignRole (processor), which loads the
// candidates and assignable roles and handles the empty cases up front. The
// tool-less confirm re-checks canAssignRole before writing (no escalation).
import type { FlowDefinition, FlowData, Transition } from "@/lib/services/flows/engine";
import { setMembershipRole } from "@/lib/services/identity/provisioning";
import { canAssignRole } from "@/lib/services/identity/role-catalog";
import type { Role } from "@/lib/types";

type Cand = { personId: string; fullName: string; role: string };

const memberRows = (cands: Cand[]) =>
  cands.map((c, i) => ({ id: `am_${i}`, title: (c.fullName || "(no name)").slice(0, 24), description: c.role }));
const roleRows = (roles: string[]) => roles.map((r, i) => ({ id: `ar_${i}`, title: r }));

export const assignRoleFlow: FlowDefinition = {
  name: "assign_role",
  firstStep: "pick_member",
  steps: {
    pick_member: {
      render: (data) => ({
        type: "list",
        header: "Change a role",
        text: "Who do you want to change the role for?",
        buttonLabel: "Choose",
        rows: memberRows((data.candidates as Cand[]) ?? []),
      }),
      onInput: (input, data): Transition => {
        const cands = (data.candidates as Cand[]) ?? [];
        const m = /^am_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? cands[Number(m[1])] : undefined;
        if (!chosen) return { stay: { type: "list", header: "Change a role", text: "Tap a member below.", buttonLabel: "Choose", rows: memberRows(cands) } };
        return { to: "pick_role", patch: { targetPersonId: chosen.personId, targetName: chosen.fullName } };
      },
    },
    pick_role: {
      render: (data) => ({
        type: "list",
        header: "Change a role",
        text: `What role should *${String(data.targetName || "they")}* have?`,
        buttonLabel: "Choose",
        rows: roleRows((data.roleOptions as string[]) ?? []),
      }),
      onInput: (input, data): Transition => {
        const roles = (data.roleOptions as string[]) ?? [];
        const m = /^ar_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? roles[Number(m[1])] : undefined;
        if (!chosen) return { stay: { type: "list", header: "Change a role", text: "Tap a role below.", buttonLabel: "Choose", rows: roleRows(roles) } };
        return { to: "confirm", patch: { chosenRole: chosen } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm role change",
        text: `Set *${String(data.targetName || "this member")}* as *${String(data.chosenRole)}*?`,
        buttons: [{ id: "ar_go", title: "✅ Set role" }, { id: "ar_cancel", title: "❌ Cancel" }],
      }),
      onInput: async (input, data: FlowData, ctx): Promise<Transition> => {
        if (input.buttonId === "ar_cancel") return { done: { type: "text", text: "No change made. What else can I help you with?" } };
        if (input.buttonId !== "ar_go" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm role change", text: "Tap *Set role* to confirm, or *Cancel*.", buttons: [{ id: "ar_go", title: "✅ Set role" }, { id: "ar_cancel", title: "❌ Cancel" }] } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        // Re-check escalation guard at commit (defence in depth).
        if (!canAssignRole(ctx.link.userRole as Role, String(data.chosenRole))) {
          return { done: { type: "text", text: "You can't assign that role." } };
        }
        const ok = data.targetPersonId && data.chosenRole
          ? await setMembershipRole(String(data.targetPersonId), ctx.link.workspaceId, String(data.chosenRole))
          : false;
        return { done: { type: "text", text: ok ? `Done — ${String(data.targetName || "they")} is now ${String(data.chosenRole)}.` : "Couldn't update that role — they may no longer be a member here." } };
      },
    },
  },
};
