// Pastoral-care flow — category → optional details → commit via the real
// request_pastoral_care tool (a pastor follows up).
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "pc_marriage", label: "Marriage" },
  { id: "pc_finance", label: "Finance" },
  { id: "pc_spiritual", label: "Spiritual" },
  { id: "pc_health", label: "Health" },
  { id: "pc_bereavement", label: "Bereavement" },
  { id: "pc_other", label: "Something else" },
];

export const pastoralFlow: FlowDefinition = {
  name: "pastoral",
  firstStep: "category",
  steps: {
    category: {
      render: () => ({
        type: "list",
        header: "Pastoral care",
        text: "What kind of support do you need? A pastor will follow up with you.",
        buttonLabel: "Choose",
        rows: CATEGORIES.map((c) => ({ id: c.id, title: c.label })),
      }),
      onInput: (input): Transition => {
        const row = CATEGORIES.find((c) => c.id === input.buttonId);
        if (!row) {
          return { stay: { type: "list", header: "Pastoral care", text: "Tap one of the categories below.", buttonLabel: "Choose", rows: CATEGORIES.map((c) => ({ id: c.id, title: c.label })) } };
        }
        return { to: "details", patch: { category: row.id === "pc_other" ? "general" : row.label.toLowerCase() } };
      },
    },
    details: {
      render: () => ({
        type: "buttons",
        header: "Pastoral care",
        text: "Anything you'd like the pastor to know before they reach out? Type it, or tap *Skip*.",
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId !== "flow_skip" && input.text.trim()) {
          data = { ...data, details: input.text.trim() };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("request_pastoral_care");
        if (!tool) return { done: { type: "text", text: "Pastoral care is unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { category: data.category, details: data.details ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't submit that: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "A pastor will reach out to you soon. 🙏" } };
      },
    },
  },
};
