// Event-registration rail (belong) — type the event name → commit via the real
// register_for_event tool (which fuzzy-matches the title). Member self-service.
import type { FlowDefinition, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

export const eventRegisterFlow: FlowDefinition = {
  name: "event_register",
  firstStep: "event_name",
  steps: {
    event_name: {
      render: () => ({
        type: "text",
        text: "Which event would you like to register for? Type its name.\n\n_See what's coming up any time via *Menu → Events*._",
      }),
      onInput: async (input, _data, ctx): Promise<Transition> => {
        const title = input.text.trim();
        if (title.length < 2) return { stay: { type: "text", text: "Type the event's name to register." } };
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("register_for_event");
        if (!tool) return { done: { type: "text", text: "Event registration is unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { eventTitle: title },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { ok?: boolean; found?: boolean; message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't register: ${res.error}` } };
        // Tool reports found:false when no event matches — keep them on the rail to retry.
        if (res.found === false) return { stay: { type: "text", text: res.message ?? "I couldn't find that event — check the name, or tap *Menu → Events*." } };
        return { done: { type: "text", text: res.message ?? "✅ You're registered! 🎟️" } };
      },
    },
  },
};
