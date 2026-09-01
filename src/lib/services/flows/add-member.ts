// Add-member rail (Phase 2, admins) — name → phone (skip) → role → confirm →
// add_member. Rank-gated (minRank 4); re-checks toolAccessError before committing.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}

// Row id → the role word the add_member/register_member tool understands.
const ROLES: Array<{ id: string; title: string; role: string }> = [
  { id: "am_member", title: "Member", role: "member" },
  { id: "am_usher", title: "Usher / Leader", role: "usher" },
  { id: "am_finance", title: "Finance", role: "finance" },
  { id: "am_secretary", title: "Secretary", role: "secretary" },
  { id: "am_pastor", title: "Pastor", role: "pastor" },
];
const roleRows = () => ROLES.map((r) => ({ id: r.id, title: r.title }));

export const addMemberFlow: FlowDefinition = {
  name: "add_member",
  firstStep: "name",
  steps: {
    name: {
      render: () => ({ type: "text", text: "Who are we adding? Send their *full name*." }),
      onInput: (input: FlowInput): Transition => {
        const name = input.text.trim().replace(/\s+/g, " ");
        if (!looksLikeName(name)) return { stay: { type: "text", text: "Please send their name (first and last is best)." } };
        return { to: "phone", patch: { name } };
      },
    },
    phone: {
      render: () => ({ type: "buttons", header: "Add a member", text: "Their WhatsApp number? Type it, or tap *Skip*.", buttons: [{ id: "flow_skip", title: "Skip" }] }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "role", patch: { phone: null } };
        return { to: "role", patch: { phone: input.text.trim() || null } };
      },
    },
    role: {
      render: () => ({ type: "list", header: "Add a member", text: "What's their role?", buttonLabel: "Choose", rows: roleRows() }),
      onInput: (input): Transition => {
        const chosen = ROLES.find((r) => r.id === input.buttonId);
        if (!chosen) return { stay: { type: "list", header: "Add a member", text: "Tap their role.", buttonLabel: "Choose", rows: roleRows() } };
        return { to: "confirm", patch: { role: chosen.role, roleLabel: chosen.title } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm",
        text: `Add *${String(data.name)}* as *${String(data.roleLabel)}*${data.phone ? ` (${String(data.phone)})` : ""}?`,
        buttons: [{ id: "am_go", title: "✅ Add" }, { id: "am_cancel", title: "❌ Cancel" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "am_cancel") return { done: { type: "text", text: "No problem — nobody was added. 🙏" } };
        if (input.buttonId !== "am_go" && !/^(yes|y|add|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm", text: "Tap *Add* to confirm, or *Cancel*.", buttons: [{ id: "am_go", title: "✅ Add" }, { id: "am_cancel", title: "❌ Cancel" }] } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("add_member");
        if (!tool) return { done: { type: "text", text: "Adding members is unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { name: data.name, role: data.role, phone: data.phone ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't add them: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? `✅ Added ${String(data.name)}.` } };
      },
    },
  },
};
