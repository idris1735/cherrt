// Lost & found rail — report a lost or found item. lost/found → describe →
// where (skip) → report_lost_or_found.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const KIND_BUTTONS = [{ id: "lf_lost", title: "I lost something" }, { id: "lf_found", title: "I found something" }];

export const lostFoundFlow: FlowDefinition = {
  name: "lost_found",
  firstStep: "kind",
  steps: {
    kind: {
      render: () => ({ type: "buttons", header: "Lost & found", text: "Lost or found something?", buttons: KIND_BUTTONS }),
      onInput: (input: FlowInput): Transition => {
        const kind = input.buttonId === "lf_found" ? "found" : input.buttonId === "lf_lost" ? "lost" : null;
        if (!kind) return { stay: { type: "buttons", header: "Lost & found", text: "Tap one below.", buttons: KIND_BUTTONS } };
        return { to: "describe", patch: { kind } };
      },
    },
    describe: {
      render: (data) => ({ type: "text", text: `What did you ${data.kind === "found" ? "find" : "lose"}? Describe the item.` }),
      onInput: (input): Transition => {
        const description = input.text.trim();
        if (description.length < 2) return { stay: { type: "text", text: "Give me a short description of the item." } };
        return { to: "location", patch: { description } };
      },
    },
    location: {
      render: () => ({ type: "buttons", header: "Lost & found", text: "Where? (e.g. main hall, car park) — type it, or tap *Skip*.", buttons: [{ id: "flow_skip", title: "Skip" }] }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        const location = input.buttonId === "flow_skip" ? null : input.text.trim() || null;
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("report_lost_or_found");
        if (!tool) return { done: { type: "text", text: "Lost & found is unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { description: data.description, location: location ?? undefined, kind: data.kind },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't log it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Logged — thank you." } };
      },
    },
  },
};
