// Child check-in flow — the first flow on the engine.
// name → age (skippable) → allergies (skippable) → confirm → commit.
// Commit calls the existing check_in_child tool, which inserts the row, sends
// the QR pickup pass image, and returns the pickup-code message. The flow must
// not duplicate any of that.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}

function summary(data: FlowData): string {
  const name = String(data.childName ?? "");
  const bits = [`*${name}*`];
  if (data.age != null) bits.push(`age ${data.age}`);
  if (data.allergies) bits.push(`allergies: ${data.allergies}`);
  return bits.join(", ");
}

export const childCheckinFlow: FlowDefinition = {
  name: "child_checkin",
  firstStep: "child_name",
  steps: {
    child_name: {
      render: () => ({
        type: "text",
        text: "Let's check your child in. 👶\n\nWhat's the child's *full name*?",
      }),
      onInput: (input: FlowInput): Transition => {
        const name = input.text.trim();
        if (!looksLikeName(name)) {
          return { stay: { type: "text", text: "Please send the child's name (first and last is best)." } };
        }
        return { to: "age", patch: { childName: name } };
      },
    },

    age: {
      render: (data) => ({
        type: "buttons",
        header: "Child check-in",
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
              header: "Child check-in",
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
        header: "Child check-in",
        text: "Any *allergies or medical notes* the children's team should know? Type them, or tap *None*.",
        buttons: [{ id: "flow_none", title: "None" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_none") return { to: "confirm", patch: { allergies: null } };
        const notes = input.text.trim();
        if (!notes) return { to: "confirm", patch: { allergies: null } };
        return { to: "confirm", patch: { allergies: notes } };
      },
    },

    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm check-in",
        text: `Checking in ${summary(data)}.\n\nAll correct?`,
        buttons: [
          { id: "flow_commit", title: "✅ Check in" },
          { id: "flow_restart", title: "✏️ Start over" },
        ],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "flow_restart") {
          return { to: "child_name", patch: { childName: undefined, age: undefined, allergies: undefined } };
        }
        if (input.buttonId !== "flow_commit" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return {
            stay: {
              type: "buttons",
              header: "Confirm check-in",
              text: `Tap *Check in* to confirm, or *Start over*.\n\n${summary(data)}`,
              buttons: [
                { id: "flow_commit", title: "✅ Check in" },
                { id: "flow_restart", title: "✏️ Start over" },
              ],
            },
          };
        }
        // In practice this flow only starts for linked members, but the
        // context type is now nullable for guest flows — guard explicitly.
        if (!ctx.link) {
          return { done: { type: "text", text: "Please connect to your church first, then I can check your child in." } };
        }
        // Commit through the real tool — it inserts the check-in, sends the QR
        // pickup pass, and returns the pickup-code message.
        const tool = getAgentTool("check_in_child");
        if (!tool) {
          return { done: { type: "text", text: "Sorry — check-in is unavailable right now. Please try again shortly." } };
        }
        const res = (await tool.handler(
          { childName: data.childName, age: data.age ?? undefined, allergies: data.allergies ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't complete the check-in: ${res.error}` } };
        return { done: { type: "text", text: `${res.message ?? "Done."}\n\nTap *Menu* if there's anything else. 🙏` } };
      },
    },
  },
};
