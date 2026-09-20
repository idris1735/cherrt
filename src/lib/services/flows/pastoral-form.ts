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
        return { to: "subject_name", patch: { formType: chosen.formType, formLabel: chosen.label } };
      },
    },
    // Essential fields are REQUIRED — no submitting an empty form on a Skip tap
    // (client feedback 2026-09-12). Name and date, then optional notes, then a
    // confirm screen, then submit.
    subject_name: {
      render: (data) => ({ type: "text", text: `*${String(data.formLabel ?? "Pastoral form")}* — whose is it for? Send the full name.` }),
      onInput: (input): Transition => {
        const name = input.text.trim();
        if (name.length < 2) return { stay: { type: "text", text: "Please send the full name." } };
        return { to: "event_date", patch: { subjectName: name } };
      },
    },
    event_date: {
      render: (data) => ({ type: "text", text: `What date is the ${String(data.formLabel ?? "form")} for? (e.g. 28 September, or next Sunday)` }),
      onInput: (input): Transition => {
        const d = input.text.trim();
        if (d.length < 3) return { stay: { type: "text", text: "Please send a date, e.g. 28 September." } };
        return { to: "notes", patch: { eventDate: d } };
      },
    },
    notes: {
      render: () => ({
        type: "buttons",
        header: "Pastoral form",
        text: "Any other details or preferences? Type them, or tap *Skip*.",
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: (input): Transition => {
        const notes = input.buttonId === "flow_skip" ? null : input.text.trim() || null;
        return { to: "confirm", patch: { notes } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: `Confirm — ${String(data.formLabel ?? "form")}`,
        text: `*${String(data.formLabel)}*\n• Name: ${String(data.subjectName)}\n• Date: ${String(data.eventDate)}${data.notes ? `\n• Notes: ${String(data.notes)}` : ""}\n\nSubmit this? A pastor will follow up.`,
        buttons: [{ id: "pf_go", title: "✅ Submit" }, { id: "pf_cancel", title: "❌ Cancel" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "pf_cancel") return { done: { type: "text", text: "No problem — nothing submitted. 🙏" } };
        if (input.buttonId !== "pf_go" && !/^(yes|y|submit|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm", text: "Tap *Submit* to send it, or *Cancel*.", buttons: [{ id: "pf_go", title: "✅ Submit" }, { id: "pf_cancel", title: "❌ Cancel" }] } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("submit_pastoral_form");
        if (!tool) return { done: { type: "text", text: "Forms are unavailable right now — please try again shortly." } };
        const details = [`Name: ${String(data.subjectName)}`, `Date: ${String(data.eventDate)}`, data.notes ? `Notes: ${String(data.notes)}` : ""]
          .filter(Boolean).join("; ");
        const res = (await tool.handler(
          { formType: data.formType, details },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't submit that: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "Submitted — a pastor will follow up. 🙏" } };
      },
    },
  },
};
