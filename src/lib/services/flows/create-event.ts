// Create-event rail (leader) — title → date (skip) → venue (skip) → confirm →
// create_event. Rank-guarded via toolAccessError.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const skip = [{ id: "flow_skip", title: "Skip" }];
const confirmBtns = [{ id: "ev_go", title: "✅ Create" }, { id: "ev_cancel", title: "❌ Cancel" }];

export const createEventFlow: FlowDefinition = {
  name: "create_event",
  firstStep: "title",
  steps: {
    title: {
      render: () => ({ type: "text", text: "What's the event called?" }),
      onInput: (input: FlowInput): Transition => {
        const title = input.text.trim();
        if (title.length < 2) return { stay: { type: "text", text: "Give the event a name." } };
        return { to: "date", patch: { title } };
      },
    },
    date: {
      render: () => ({ type: "buttons", header: "Create event", text: "What date? Send it as *YYYY-MM-DD*, or tap *Skip* (defaults to next Sunday).", buttons: skip }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "venue", patch: { date: null } };
        return { to: "venue", patch: { date: input.text.trim() || null } };
      },
    },
    venue: {
      render: () => ({ type: "buttons", header: "Create event", text: "Where's it held? Type a venue, or tap *Skip* (defaults to Main Auditorium).", buttons: skip }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "confirm", patch: { venue: null } };
        return { to: "confirm", patch: { venue: input.text.trim() || null } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm event",
        text: `Create *${String(data.title)}*${data.date ? ` on ${String(data.date)}` : ""}${data.venue ? ` at ${String(data.venue)}` : ""}?`,
        buttons: confirmBtns,
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "ev_cancel") return { done: { type: "text", text: "No problem — no event created. 🙏" } };
        if (input.buttonId !== "ev_go" && !/^(yes|y|create|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm event", text: "Tap *Create*, or *Cancel*.", buttons: confirmBtns } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("create_event");
        if (!tool) return { done: { type: "text", text: "Events are unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { title: data.title, date: data.date ?? undefined, venue: data.venue ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't create it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Event created." } };
      },
    },
  },
};
