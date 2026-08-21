// Join-a-ministry flow — which ministry → confirm → commit via the real
// join_department tool (leaders get Approve/Decline buttons).
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

export const joinFlow: FlowDefinition = {
  name: "join",
  firstStep: "department",
  steps: {
    department: {
      render: (data) => ({
        type: "text",
        text: data.department
          ? `Apply to join *${String(data.department)}*?`
          : "Which ministry would you like to join? e.g. choir, ushering, media, children, prayer band.",
      }),
      onInput: (input: FlowInput, data: FlowData): Transition => {
        if (data.department) return { to: "confirm" }; // seeded — don't re-ask
        const dept = input.text.trim();
        if (!dept) return { stay: { type: "text", text: "Tell me which ministry you'd like to join — e.g. choir, ushering, media." } };
        return { to: "confirm", patch: { department: dept } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Join ministry",
        text: `Apply to join *${String(data.department)}*? A leader will review and approve.`,
        buttons: [
          { id: "join_apply", title: "✅ Apply" },
          { id: "join_change", title: "✏️ Change" },
        ],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "join_change") {
          return { to: "department", patch: { department: undefined } };
        }
        if (input.buttonId !== "join_apply" && !/^(yes|y|confirm|apply)$/i.test(input.text.trim())) {
          return {
            stay: {
              type: "buttons",
              header: "Join ministry",
              text: `Tap *Apply* to join *${String(data.department)}*, or *Change* to pick another.`,
              buttons: [
                { id: "join_apply", title: "✅ Apply" },
                { id: "join_change", title: "✏️ Change" },
              ],
            },
          };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("join_department");
        if (!tool) return { done: { type: "text", text: "Ministry applications are unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { department: data.department },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't submit the application: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "Application sent — a leader will review it. 🙏" } };
      },
    },
  },
};
