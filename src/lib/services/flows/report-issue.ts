// Report-issue rail (Phase 4 ops) — describe → where → urgency → commit via the
// real report_issue tool. Any member may report a fault.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

const SEV_BUTTONS = [
  { id: "sev_high", title: "🔴 High" },
  { id: "sev_medium", title: "🟡 Medium" },
  { id: "sev_low", title: "🟢 Low" },
];

export const reportIssueFlow: FlowDefinition = {
  name: "issue",
  firstStep: "title",
  steps: {
    title: {
      render: () => ({ type: "text", text: "What's the issue? Describe it briefly — e.g. *Toilet not flushing* or *Leaking roof in the hall*." }),
      onInput: (input: FlowInput): Transition => {
        const title = input.text.trim();
        if (title.length < 3) return { stay: { type: "text", text: "Give me a short description of the problem." } };
        return { to: "area", patch: { title } };
      },
    },
    area: {
      render: () => ({
        type: "buttons",
        header: "Report an issue",
        text: "Where is it? (e.g. main hall, toilets, car park) — type it, or tap *Skip*.",
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "severity", patch: { area: null } };
        return { to: "severity", patch: { area: input.text.trim() || null } };
      },
    },
    severity: {
      render: () => ({ type: "buttons", header: "Report an issue", text: "How urgent is it?", buttons: SEV_BUTTONS }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        const m = /^sev_(high|medium|low)$/.exec(input.buttonId ?? "");
        const typed = input.text.trim().toLowerCase();
        const severity = m ? m[1] : (["high", "medium", "low"].includes(typed) ? typed : null);
        if (!severity) return { stay: { type: "buttons", header: "Report an issue", text: "Tap how urgent it is.", buttons: SEV_BUTTONS } };
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("report_issue");
        if (!tool) return { done: { type: "text", text: "Reporting is unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { title: data.title, area: data.area ?? undefined, severity },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't log it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Logged — thank you. Someone will look into it. 🙏" } };
      },
    },
  },
};
