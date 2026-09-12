// Add-guardian rail — a registered guardian authorises another person (co-parent,
// grandparent, nanny) to collect a specific child. child → new guardian name →
// their phone → confirm → add_guardian. The tool self-gates: only an existing
// guardian of the named child can add one (checked against guardianships).
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

const confirmButtons = [
  { id: "ag_go", title: "✅ Authorise" },
  { id: "ag_cancel", title: "❌ Cancel" },
];

export const addGuardianFlow: FlowDefinition = {
  name: "add_guardian",
  firstStep: "child",
  steps: {
    child: {
      render: (data) => ({
        type: "text",
        text: data.childName
          ? `Authorise someone to collect *${String(data.childName)}*. What's their full name?`
          : "Who do you want to authorise for pickup? First — which child? Send the child's full name.",
      }),
      onInput: (input: FlowInput, data: FlowData): Transition => {
        const v = input.text.trim();
        if (data.childName) {
          // child seeded from a typed intent — this input is the guardian's name.
          if (!v) return { stay: { type: "text", text: "Send the new guardian's full name." } };
          return { to: "phone", patch: { guardianName: v } };
        }
        if (!v) return { stay: { type: "text", text: "Send the child's full name." } };
        return { to: "guardian_name", patch: { childName: v } };
      },
    },
    guardian_name: {
      render: (data) => ({ type: "text", text: `Who do you want to authorise to collect *${String(data.childName)}*? Send their full name.` }),
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
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Authorise pickup",
        text: `Allow *${String(data.guardianName)}* (${String(data.guardianPhone)}) to collect *${String(data.childName)}*?`,
        buttons: confirmButtons,
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "ag_cancel") return { done: { type: "text", text: "No problem — no change made. 🙏" } };
        if (input.buttonId !== "ag_go" && !/^(yes|y|confirm|authorise|authorize)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Authorise pickup", text: "Tap *Authorise* to confirm, or *Cancel*.", buttons: confirmButtons } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("add_guardian");
        if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { childName: data.childName, guardianName: data.guardianName, guardianPhone: data.guardianPhone },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: res.error } };
        return { done: { type: "text", text: res.message ?? "✅ Guardian authorised." } };
      },
    },
  },
};
