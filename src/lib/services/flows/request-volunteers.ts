// Request-volunteers rail (leader) — what's needed → when (skip) → how many
// (skip) → confirm → request_volunteers. Rank-guarded.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const skip = [{ id: "flow_skip", title: "Skip" }];
const confirmBtns = [{ id: "rv_go", title: "✅ Post" }, { id: "rv_cancel", title: "❌ Cancel" }];

export const requestVolunteersFlow: FlowDefinition = {
  name: "request_volunteers",
  firstStep: "title",
  steps: {
    title: {
      render: () => ({ type: "text", text: "What do you need volunteers for? e.g. *Ushers for the vigil*." }),
      onInput: (input: FlowInput): Transition => {
        const title = input.text.trim();
        if (title.length < 2) return { stay: { type: "text", text: "Tell me what's needed." } };
        return { to: "when", patch: { title } };
      },
    },
    when: {
      render: () => ({ type: "buttons", header: "Request volunteers", text: "When is it for? Type it, or tap *Skip*.", buttons: skip }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "slots", patch: { when: null } };
        return { to: "slots", patch: { when: input.text.trim() || null } };
      },
    },
    slots: {
      render: () => ({ type: "buttons", header: "Request volunteers", text: "How many are needed? Send a number, or tap *Skip*.", buttons: skip }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "confirm", patch: { slots: null } };
        const n = Number(input.text.replace(/[,\s]/g, ""));
        if (!Number.isFinite(n) || n <= 0) return { stay: { type: "buttons", header: "Request volunteers", text: "Send a number, or tap *Skip*.", buttons: skip } };
        return { to: "confirm", patch: { slots: Math.floor(n) } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Post volunteer call",
        text: `Post: *${String(data.title)}*${data.when ? ` (${String(data.when)})` : ""}${data.slots ? ` — ${String(data.slots)} needed` : ""}?`,
        buttons: confirmBtns,
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "rv_cancel") return { done: { type: "text", text: "No problem — nothing posted. 🙏" } };
        if (input.buttonId !== "rv_go" && !/^(yes|y|post|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Post volunteer call", text: "Tap *Post*, or *Cancel*.", buttons: confirmBtns } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("request_volunteers");
        if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { title: data.title, when: data.when ?? undefined, slots: data.slots ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't post it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Volunteer call posted." } };
      },
    },
  },
};
