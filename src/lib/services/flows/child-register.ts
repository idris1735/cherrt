// Child registration flow (Phase 2). Prereq for check-in: creates the child's
// person + profile + a primary guardianship. Directness rail equivalent of the
// register_child tool.
//
// SAFETY: a child can NEVER be stored without recorded guardian consent — the
// tool rejects guardianConsent !== true. So this flow has an explicit consent
// step before the confirm, and only ever calls the tool with guardianConsent:true.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}

function summary(data: FlowData): string {
  const bits = [`*${String(data.childName ?? "")}*`];
  if (data.age != null) bits.push(`age ${data.age}`);
  if (data.allergies) bits.push(`allergies/notes: ${data.allergies}`);
  return bits.join(", ");
}

export const childRegisterFlow: FlowDefinition = {
  name: "child_register",
  firstStep: "child_name",
  steps: {
    child_name: {
      render: () => ({
        type: "text",
        text: "Let's register your child in the children's ministry. 🧒\n\nWhat's the child's *full name*?",
      }),
      onInput: (input: FlowInput): Transition => {
        const name = input.text.trim().replace(/\s+/g, " ");
        if (!looksLikeName(name)) {
          return { stay: { type: "text", text: "Please send the child's name (first and last is best)." } };
        }
        return { to: "age", patch: { childName: name } };
      },
    },

    age: {
      render: (data) => ({
        type: "buttons",
        header: "Register a child",
        text: `How old is ${String(data.childName)}? Type a number, or tap *Skip*.`,
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "allergies", patch: { age: null } };
        const n = Number(input.text.trim());
        if (!Number.isFinite(n) || n < 0 || n > 18) {
          return {
            stay: {
              type: "buttons",
              header: "Register a child",
              text: "Please send an age between 0 and 18, or tap *Skip*.",
              buttons: [{ id: "flow_skip", title: "Skip" }],
            },
          };
        }
        return { to: "allergies", patch: { age: Math.floor(n) } };
      },
    },

    allergies: {
      render: () => ({
        type: "buttons",
        header: "Register a child",
        text: "Any *allergies or medical notes* the children's team should know? Type them, or tap *None*.",
        buttons: [{ id: "flow_none", title: "None" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_none") return { to: "consent", patch: { allergies: null } };
        const notes = input.text.trim();
        return { to: "consent", patch: { allergies: notes || null } };
      },
    },

    // Safety gate — explicit guardian consent, required before anything is stored.
    consent: {
      render: (data) => ({
        type: "buttons",
        header: "Guardian consent",
        text: `Before I save ${String(data.childName)}'s details, please confirm:\n\n*I'm this child's parent or guardian, and I consent to storing their details.*`,
        buttons: [
          { id: "consent_yes", title: "✅ I confirm" },
          { id: "consent_no", title: "❌ Cancel" },
        ],
      }),
      onInput: (input, data): Transition => {
        if (input.buttonId === "consent_no") {
          return { done: { type: "text", text: "No problem — nothing was saved. Tap *Menu* anytime. 🙏" } };
        }
        if (input.buttonId !== "consent_yes" && !/^(yes|y|i confirm|confirm)$/i.test(input.text.trim())) {
          return {
            stay: {
              type: "buttons",
              header: "Guardian consent",
              text: `For ${String(data.childName)}'s safety I need you to confirm you're their parent/guardian. Tap *I confirm*, or *Cancel*.`,
              buttons: [
                { id: "consent_yes", title: "✅ I confirm" },
                { id: "consent_no", title: "❌ Cancel" },
              ],
            },
          };
        }
        return { to: "confirm", patch: { guardianConsent: true } };
      },
    },

    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm registration",
        text: `Registering ${summary(data)}.\n\nAll correct?`,
        buttons: [
          { id: "flow_commit", title: "✅ Register" },
          { id: "flow_restart", title: "✏️ Start over" },
        ],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "flow_restart") {
          return { to: "child_name", patch: { childName: undefined, age: undefined, allergies: undefined, guardianConsent: undefined } };
        }
        if (input.buttonId !== "flow_commit" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return {
            stay: {
              type: "buttons",
              header: "Confirm registration",
              text: `Tap *Register* to confirm, or *Start over*.\n\n${summary(data)}`,
              buttons: [
                { id: "flow_commit", title: "✅ Register" },
                { id: "flow_restart", title: "✏️ Start over" },
              ],
            },
          };
        }
        if (!ctx.link) {
          return { done: { type: "text", text: "Please connect to your church first, then I can register your child." } };
        }
        const tool = getAgentTool("register_child");
        if (!tool) {
          return { done: { type: "text", text: "Sorry — registration is unavailable right now. Please try again shortly." } };
        }
        const res = (await tool.handler(
          {
            childName: data.childName,
            guardianConsent: true,
            age: data.age ?? undefined,
            allergies: data.allergies ?? undefined,
          },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't complete the registration: ${res.error}` } };
        return { done: { type: "text", text: `${res.message ?? "Done."}\n\nYou can check ${String(data.childName)} in on a Sunday from the *Menu*. 🙏` } };
      },
    },
  },
};
