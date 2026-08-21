// Give flow — amount → type → confirm → commit via the real give_now tool
// (payment link). Money stays confirmation-gated: the confirm step IS the gate.
// Seeded with an amount, it never re-asks it.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

const GIVING_TYPES = ["Tithe", "Offering", "Donation", "Pledge"];

export const giveFlow: FlowDefinition = {
  name: "give",
  firstStep: "amount",
  steps: {
    amount: {
      render: (data) => ({
        type: "text",
        text: data.amount ? `Give ₦${Number(data.amount).toLocaleString("en-NG")} — what type?` : "How much would you like to give? Send the amount in Naira (e.g. 5000).",
      }),
      onInput: (input: FlowInput, data: FlowData): Transition => {
        if (data.amount) return { to: "giving_type" }; // seeded — don't re-ask
        const n = Number(input.text.replace(/[₦,\s]/g, ""));
        if (!Number.isFinite(n) || n <= 0) return { stay: { type: "text", text: "Please send a valid amount in Naira, e.g. 5000." } };
        return { to: "giving_type", patch: { amount: Math.round(n) } };
      },
    },
    giving_type: {
      render: () => ({
        type: "list",
        header: "Giving",
        text: "What kind of giving is this?",
        buttonLabel: "Choose",
        rows: GIVING_TYPES.map((t) => ({ id: `gt_${t.toLowerCase()}`, title: t })),
      }),
      onInput: (input): Transition => {
        const m = /^gt_(\w+)$/.exec(input.buttonId ?? "");
        const typed = input.text.trim().toLowerCase();
        const type = m ? m[1] : GIVING_TYPES.map((t) => t.toLowerCase()).find((t) => t === typed);
        if (!type) return { stay: { type: "list", header: "Giving", text: "Tap the type of giving.", buttonLabel: "Choose", rows: GIVING_TYPES.map((t) => ({ id: `gt_${t.toLowerCase()}`, title: t })) } };
        return { to: "confirm", patch: { givingType: type } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm giving",
        text: `Give *₦${Number(data.amount).toLocaleString("en-NG")}* as *${String(data.givingType)}*? I'll send a secure payment link.`,
        buttons: [{ id: "give_go", title: "✅ Send link" }, { id: "give_cancel", title: "❌ Cancel" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "give_cancel") return { done: { type: "text", text: "No problem — nothing was charged. Tap *Menu* anytime. 🙏" } };
        if (input.buttonId !== "give_go" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm giving", text: `Tap *Send link* to give ₦${Number(data.amount).toLocaleString("en-NG")} (${String(data.givingType)}), or *Cancel*.`, buttons: [{ id: "give_go", title: "✅ Send link" }, { id: "give_cancel", title: "❌ Cancel" }] } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("give_now");
        if (!tool) return { done: { type: "text", text: "Giving is unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { amount: data.amount, givingType: data.givingType },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't start the giving: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "Done." } };
      },
    },
  },
};
