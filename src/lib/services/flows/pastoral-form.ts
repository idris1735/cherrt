// Pastoral-form flow (Phase 2) — pick a form → optional details → commit via the
// real submit_pastoral_form tool (which stores the submission, records consent,
// and notifies leaders). Mirrors the pastoral-care rail's shape.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

// id maps 1:1 to the tool's formType (pf_ prefix strips to the value).
const FORMS: Array<{ formType: string; label: string }> = [
  { formType: "baby_dedication", label: "Baby Dedication" },
  { formType: "child_naming", label: "Child Naming" },
  { formType: "house_dedication", label: "House Dedication" },
  { formType: "pre_marital", label: "Pre-Marital Counselling" },
  { formType: "training_school", label: "Training School" },
];

const formRows = () => FORMS.map((f) => ({ id: `pf_${f.formType}`, title: f.label }));

export const pastoralFormFlow: FlowDefinition = {
  name: "pastoral_form",
  firstStep: "form_type",
  steps: {
    form_type: {
      render: () => ({
        type: "list",
        header: "Pastoral forms",
        text: "Which form would you like to submit? A pastor will follow up.",
        buttonLabel: "Choose",
        rows: formRows(),
      }),
      onInput: (input: FlowInput): Transition => {
        const m = /^pf_(\w+)$/.exec(input.buttonId ?? "");
        const chosen = m ? FORMS.find((f) => f.formType === m[1]) : undefined;
        if (!chosen) {
          return { stay: { type: "list", header: "Pastoral forms", text: "Tap one of the forms below.", buttonLabel: "Choose", rows: formRows() } };
        }
        return { to: "details", patch: { formType: chosen.formType, formLabel: chosen.label } };
      },
    },
    details: {
      render: (data) => ({
        type: "buttons",
        header: String(data.formLabel ?? "Pastoral form"),
        text: "Any details — names, dates, preferences? Type them, or tap *Skip*.",
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId !== "flow_skip" && input.text.trim()) {
          data = { ...data, details: input.text.trim() };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("submit_pastoral_form");
        if (!tool) return { done: { type: "text", text: "Forms are unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { formType: data.formType, details: data.details ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't submit that: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "Submitted — a pastor will follow up. 🙏" } };
      },
    },
  },
};
