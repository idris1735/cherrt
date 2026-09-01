// First-timer capture flow (Phase 2) — logs a visitor for follow-up. Works for a
// visitor doing it themselves or an usher capturing on their behalf.
// name → phone (skippable) → who invited (skippable) → commit via the real
// capture_first_timer tool (links identity, records consent, notifies).
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}

async function commit(data: FlowData, ctx: FlowRunContext): Promise<Transition> {
  if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
  const tool = getAgentTool("capture_first_timer");
  if (!tool) return { done: { type: "text", text: "First-timer capture is unavailable right now — please try again shortly." } };
  const res = (await tool.handler(
    { name: data.visitorName, phone: data.phone ?? undefined, invitedBy: data.invitedBy ?? undefined },
    { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
  )) as { message?: string; error?: string };
  if (res.error) return { done: { type: "text", text: `Couldn't save that: ${res.error}` } };
  return { done: { type: "text", text: res.message ?? "Noted — someone will reach out. 🙏" } };
}

export const firstTimerFlow: FlowDefinition = {
  name: "first_timer",
  firstStep: "visitor_name",
  steps: {
    visitor_name: {
      render: () => ({
        type: "text",
        text: "Let's log a first-time visitor. 👋\n\nWhat's their *full name*?",
      }),
      onInput: (input: FlowInput): Transition => {
        const name = input.text.trim().replace(/\s+/g, " ");
        if (!looksLikeName(name)) {
          return { stay: { type: "text", text: "Please send the visitor's name (first and last is best)." } };
        }
        return { to: "phone", patch: { visitorName: name } };
      },
    },

    phone: {
      render: (data) => ({
        type: "buttons",
        header: "First-timer",
        text: `A phone number for ${String(data.visitorName)} so the church can follow up? Type it, or tap *Skip*.`,
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "invited_by", patch: { phone: null } };
        const phone = input.text.trim();
        return { to: "invited_by", patch: { phone: phone || null } };
      },
    },

    invited_by: {
      render: () => ({
        type: "buttons",
        header: "First-timer",
        text: "Who invited them? Type a name, or tap *Skip*.",
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId !== "flow_skip" && input.text.trim()) {
          data = { ...data, invitedBy: input.text.trim() };
        }
        return commit(data, ctx);
      },
    },
  },
};
