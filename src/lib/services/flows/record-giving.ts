// Record-giving rail (Phase 3, finance) — log giving that was RECEIVED (cash /
// transfer at a service). Distinct from the member `give` rail (which collects
// money). amount → type → donor (skip = anonymous) → confirm → record_giving.
// The tool is minRank-gated (finance+), so only finance sees the menu row.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const GIVING_TYPES = ["Tithe", "Offering", "Donation", "Pledge"];
const typeRows = () => GIVING_TYPES.map((t) => ({ id: `rg_${t.toLowerCase()}`, title: t }));

export const recordGivingFlow: FlowDefinition = {
  name: "record_giving",
  firstStep: "amount",
  steps: {
    amount: {
      render: () => ({ type: "text", text: "Let's log a giving that came in. How much? Send the amount in Naira (e.g. 5000)." }),
      onInput: (input: FlowInput): Transition => {
        const n = Number(input.text.replace(/[₦,\s]/g, ""));
        if (!Number.isFinite(n) || n <= 0) return { stay: { type: "text", text: "Please send a valid amount in Naira, e.g. 5000." } };
        return { to: "giving_type", patch: { amount: Math.round(n) } };
      },
    },
    giving_type: {
      render: () => ({ type: "list", header: "Record giving", text: "What kind of giving is this?", buttonLabel: "Choose", rows: typeRows() }),
      onInput: (input): Transition => {
        const m = /^rg_(\w+)$/.exec(input.buttonId ?? "");
        const typed = input.text.trim().toLowerCase();
        const type = m ? m[1] : GIVING_TYPES.map((t) => t.toLowerCase()).find((t) => t === typed);
        if (!type) return { stay: { type: "list", header: "Record giving", text: "Tap the type of giving.", buttonLabel: "Choose", rows: typeRows() } };
        return { to: "donor", patch: { givingType: type } };
      },
    },
    donor: {
      render: () => ({
        type: "buttons",
        header: "Record giving",
        text: "Whose giving is this? Type the donor's name, or tap *Anonymous*.",
        buttons: [{ id: "rg_anon", title: "Anonymous" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "rg_anon") return { to: "confirm", patch: { donor: null } };
        return { to: "confirm", patch: { donor: input.text.trim() || null } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm giving",
        text: `Record *₦${Number(data.amount).toLocaleString("en-NG")}* ${String(data.givingType)} from *${data.donor ? String(data.donor) : "Anonymous"}*?`,
        buttons: [{ id: "rg_go", title: "✅ Record" }, { id: "rg_cancel", title: "❌ Cancel" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "rg_cancel") return { done: { type: "text", text: "No problem — nothing recorded. Tap *Menu* anytime. 🙏" } };
        if (input.buttonId !== "rg_go" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm giving", text: "Tap *Record* to log it, or *Cancel*.", buttons: [{ id: "rg_go", title: "✅ Record" }, { id: "rg_cancel", title: "❌ Cancel" }] } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("record_giving");
        if (!tool) return { done: { type: "text", text: "Recording is unavailable right now — please try again shortly." } };
        // record_giving is rank-gated (finance+). Rails call the handler directly,
        // so re-enforce the same access check the agent path applies.
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { amount: data.amount, givingType: data.givingType, donor: data.donor ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't record it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Giving recorded." } };
      },
    },
  },
};
