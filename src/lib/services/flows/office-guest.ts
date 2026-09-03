// Office-guest sign-in rail (front desk) — name → who they're seeing (skip) →
// purpose (skip) → register_office_guest (returns a sign-in code). Rank-guarded.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const skip = [{ id: "flow_skip", title: "Skip" }];

export const officeGuestFlow: FlowDefinition = {
  name: "office_guest",
  firstStep: "name",
  steps: {
    name: {
      render: () => ({ type: "text", text: "🪪 Signing in an office visitor. What's their name?" }),
      onInput: (input: FlowInput): Transition => {
        const name = input.text.trim();
        if (name.length < 2) return { stay: { type: "text", text: "What's the visitor's name?" } };
        return { to: "host", patch: { name } };
      },
    },
    host: {
      render: () => ({ type: "buttons", header: "Office visitor", text: "Who are they here to see? Type a name, or tap *Skip*.", buttons: skip }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "purpose", patch: { host: null } };
        return { to: "purpose", patch: { host: input.text.trim() || null } };
      },
    },
    purpose: {
      render: () => ({ type: "buttons", header: "Office visitor", text: "What's the visit about? Type it, or tap *Skip*.", buttons: skip }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        const purpose = input.buttonId === "flow_skip" ? null : input.text.trim() || null;
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("register_office_guest");
        if (!tool) return { done: { type: "text", text: "Sign-in is unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { name: data.name, host: data.host ?? undefined, purpose: purpose ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't sign them in: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Signed in." } };
      },
    },
  },
};
