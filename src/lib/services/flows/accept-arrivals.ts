// Accept-arrivals rail (Phase 4, children's team) — a teacher marks checked-in
// children as arrived in their class. The auth check runs BEFORE any child PII is
// listed (the first step is a neutral prompt), then the pending list is shown.
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import { listPendingArrivals, type PendingArrival } from "@/lib/services/children/checkins";
import type { Role } from "@/lib/types";

function pickRows(pending: PendingArrival[]) {
  const rows = pending.slice(0, 9).map((p, i) => ({ id: `acc_${i}`, title: p.childName.slice(0, 24), description: p.classroom ?? "" }));
  rows.push({ id: "acc_done", title: "✅ Done", description: "" });
  return rows;
}

export const acceptArrivalsFlow: FlowDefinition = {
  name: "accept_arrivals",
  firstStep: "start",
  steps: {
    // Neutral prompt first — no PII until we've confirmed the caller is allowed.
    start: {
      render: () => ({ type: "buttons", header: "Accept arrivals", text: "See the children waiting to be accepted into class?", buttons: [{ id: "arrivals_go", title: "View arrivals" }] }),
      onInput: async (_input: FlowInput, _data, ctx): Promise<Transition> => {
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("accept_arrival");
        if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const pending = await listPendingArrivals(ctx.link.workspaceId);
        if (!pending.length) return { done: { type: "text", text: "🎉 No children waiting — everyone checked in has been accepted." } };
        return { to: "pick", patch: { pending } };
      },
    },
    pick: {
      render: (data) => {
        const pending = (data.pending as PendingArrival[]) ?? [];
        const note = data.lastAccepted ? `✅ ${String(data.lastAccepted)} is in class.\n\n` : "";
        return { type: "list", header: "Accept arrivals", text: `${note}Tap a child to mark them arrived in class.`, buttonLabel: "Choose", rows: pickRows(pending) };
      },
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "acc_done") return { done: { type: "text", text: "👍 Done. 🙏" } };
        const pending = (data.pending as PendingArrival[]) ?? [];
        const m = /^acc_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? pending[Number(m[1])] : undefined;
        if (!chosen) return { stay: { type: "list", header: "Accept arrivals", text: "Tap a child, or *Done*.", buttonLabel: "Choose", rows: pickRows(pending) } };
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("accept_arrival")!;
        const res = (await tool.handler(
          { checkinId: chosen.id },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: res.error } };
        // Re-fetch the remaining pending; loop until the class is clear or they tap Done.
        const remaining = await listPendingArrivals(ctx.link.workspaceId);
        if (!remaining.length) return { done: { type: "text", text: `✅ ${chosen.childName} accepted. Everyone's in class now. 🙏` } };
        return { to: "pick", patch: { pending: remaining, lastAccepted: chosen.childName } };
      },
    },
  },
};
