// Add-guardian rail — a registered guardian authorises another person (co-parent,
// grandparent, nanny) to collect one of their children.
//
// CHQ-016: the child is now a SELECTION from the guardian's own registered
// children (seeded by the processor), not a free-typed name — so you can't
// mistype a name, can't confuse it with the new guardian's name, and a wrong
// child is caught up front instead of at the very end. Before anything is
// granted there's a deliberate security step: you must reply AUTHORISE in full,
// so pickup rights are never handed out by a stray tap. On a tool error the flow
// offers a retry instead of dropping you to the main menu.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

type MyChild = { personId: string; name: string };

const retryButtons = [
  { id: "ag_retry", title: "🔄 Try again" },
  { id: "ag_cancel", title: "❌ Cancel" },
];

function childRows(kids: MyChild[]) {
  return kids.map((k, i) => ({ id: `ag_child_${i}`, title: k.name.slice(0, 24) }));
}

export const addGuardianFlow: FlowDefinition = {
  name: "add_guardian",
  intro: "*🧑‍🤝‍🧑 Authorise pickup* — let a co-parent, grandparent or nanny collect your child.",
  firstStep: "pick_child",
  steps: {
    // Seeded by startAddGuardian (processor) with the guardian's OWN registered
    // children. Started only when there is at least one, so the list is never
    // empty here.
    pick_child: {
      render: (data) => {
        const kids = (data.myChildren as MyChild[]) ?? [];
        return {
          type: "list",
          header: "Authorise pickup",
          text: "Which of your children do you want to authorise someone to collect?",
          buttonLabel: "Choose",
          rows: childRows(kids),
        };
      },
      onInput: (input: FlowInput, data: FlowData): Transition => {
        const kids = (data.myChildren as MyChild[]) ?? [];
        const m = /^ag_child_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? kids[Number(m[1])] : undefined;
        if (!chosen) {
          return { stay: { type: "list", header: "Authorise pickup", text: "Tap one of your children below.", buttonLabel: "Choose", rows: childRows(kids) } };
        }
        return { to: "guardian_name", patch: { childName: chosen.name, childPersonId: chosen.personId } };
      },
    },
    guardian_name: {
      render: (data) => ({ type: "text", text: `Who do you want to authorise to collect *${String(data.childName)}*? Send *their* full name (not yours).` }),
      onInput: (input): Transition => {
        const name = input.text.trim();
        if (!name) return { stay: { type: "text", text: "Send their full name." } };
        return { to: "phone", patch: { guardianName: name } };
      },
    },
    phone: {
      render: (data) => ({
        type: "text",
        text: `And ${String(data.guardianName || "their")}'s WhatsApp number? (e.g. 08012345678) — their number is how we recognise them at pickup.`,
      }),
      onInput: (input): Transition => {
        const raw = input.text.replace(/[^\d+]/g, "");
        if (raw.replace(/\D/g, "").length < 10) {
          return { stay: { type: "text", text: "That doesn't look like a full number. Send it like 08012345678." } };
        }
        return { to: "confirm", patch: { guardianPhone: raw } };
      },
    },
    // Security step — a deliberate, typed confirmation, so pickup rights are
    // never granted by a single casual tap (CHQ-016).
    confirm: {
      render: (data) => ({
        type: "text",
        text: `🔒 *Security check*\n\nThis lets *${String(data.guardianName)}* (${String(data.guardianPhone)}) collect *${String(data.childName)}* — at pickup they're recognised by that number.\n\nTo confirm, reply *AUTHORISE* in full. Reply *cancel* to stop.`,
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        const t = input.text.trim();
        if (input.buttonId === "ag_cancel" || /^cancel$/i.test(t)) return { done: { type: "text", text: "No problem — no change made. 🙏" } };
        // Retry after a failed authorisation — start over so a wrong child or a
        // mistyped number can be fixed without leaving the flow.
        if (input.buttonId === "ag_retry") {
          return { to: "pick_child", patch: { childName: undefined, childPersonId: undefined, guardianName: undefined, guardianPhone: undefined } };
        }
        if (!/^authori[sz]e$/i.test(t)) {
          return { stay: { type: "text", text: "To confirm, reply *AUTHORISE* in full — that's the security step. Reply *cancel* to stop." } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("add_guardian");
        if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { childName: data.childName, guardianName: data.guardianName, guardianPhone: data.guardianPhone },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        // On error, stay in the flow and offer a retry rather than ending — ending
        // drops the user to the main menu, forcing a full restart (CHQ-016).
        if (res.error) {
          return { stay: { type: "buttons", header: "Authorise pickup", text: `${res.error}\n\nWant to try again?`, buttons: retryButtons } };
        }
        return { done: { type: "text", text: res.message ?? "✅ Guardian authorised." } };
      },
    },
  },
};
