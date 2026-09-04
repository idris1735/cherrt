// Create-classroom rail (leader) — name → capacity (skip = no limit) →
// create_classroom. Rank-guarded via toolAccessError.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

export const createClassroomFlow: FlowDefinition = {
  name: "create_classroom",
  firstStep: "name",
  steps: {
    name: {
      render: () => ({ type: "text", text: "🏫 What's the classroom called? e.g. *Nursery* or *Primary*." }),
      onInput: (input: FlowInput): Transition => {
        const name = input.text.trim();
        if (name.length < 2) return { stay: { type: "text", text: "Give the classroom a name." } };
        return { to: "capacity", patch: { name } };
      },
    },
    capacity: {
      render: () => ({ type: "buttons", header: "Add classroom", text: "Max number of children? Send a number, or tap *No limit*.", buttons: [{ id: "cl_nolimit", title: "No limit" }] }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        let capacity: number | null = null;
        if (input.buttonId !== "cl_nolimit") {
          const n = Number(input.text.replace(/[,\s]/g, ""));
          if (!Number.isFinite(n) || n <= 0) return { stay: { type: "buttons", header: "Add classroom", text: "Send a number, or tap *No limit*.", buttons: [{ id: "cl_nolimit", title: "No limit" }] } };
          capacity = Math.floor(n);
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("create_classroom");
        if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { name: data.name, capacity: capacity ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't create it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Classroom created." } };
      },
    },
  },
};
