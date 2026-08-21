// Prayer flow — what to pray about → share name / anonymous → commit via the
// real capture_prayer_request tool.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

export const prayerFlow: FlowDefinition = {
  name: "prayer",
  firstStep: "request",
  steps: {
    request: {
      render: () => ({ type: "text", text: "What would you like the prayer team to pray about?" }),
      onInput: (input): Transition => {
        const request = input.text.trim();
        if (!request) return { stay: { type: "text", text: "Please tell me what to pray about — a sentence is enough." } };
        return { to: "anon", patch: { request } };
      },
    },
    anon: {
      render: () => ({
        type: "buttons",
        header: "Prayer request",
        text: "Should the prayer team see your name?",
        buttons: [
          { id: "prayer_share", title: "🙏 Share my name" },
          { id: "prayer_anon", title: "🔒 Keep anonymous" },
        ],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId !== "prayer_share" && input.buttonId !== "prayer_anon") {
          return {
            stay: {
              type: "buttons",
              header: "Prayer request",
              text: "Tap one — share your name or stay anonymous.",
              buttons: [
                { id: "prayer_share", title: "🙏 Share my name" },
                { id: "prayer_anon", title: "🔒 Keep anonymous" },
              ],
            },
          };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("capture_prayer_request");
        if (!tool) return { done: { type: "text", text: "Prayer requests are unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { request: data.request, anonymous: input.buttonId === "prayer_anon" },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't submit that: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "Received — the prayer team is on it. 🙏" } };
      },
    },
  },
};
