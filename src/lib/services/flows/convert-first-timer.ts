// Convert-first-timer rail (leader) — turn a logged first-timer into a member.
// name → convert_first_timer (finds by name, creates membership, marks joined).
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

export const convertFirstTimerFlow: FlowDefinition = {
  name: "convert_first_timer",
  firstStep: "name",
  steps: {
    name: {
      render: () => ({ type: "text", text: "Who's joining as a member? Send the first-timer's *name* (as it was logged)." }),
      onInput: async (input: FlowInput, _data, ctx): Promise<Transition> => {
        const name = input.text.trim();
        if (name.length < 2) return { stay: { type: "text", text: "Send the first-timer's name." } };
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("convert_first_timer");
        if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { name },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        // Not-found / already-member come back as an error — keep them on the rail to retry the name.
        if (res.error) return { stay: { type: "text", text: `${res.error}\n\nTry the name again, or reply *menu*.` } };
        return { done: { type: "text", text: res.message ?? "✅ Converted to a member." } };
      },
    },
  },
};
