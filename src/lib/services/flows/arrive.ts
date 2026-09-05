// Arrive rail — a guardian converts a pre-held seat into a real check-in on the
// day (held → checked_in, issues the pickup code + label). One held seat is
// auto-converted; several are offered as a tap list.
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { listHeldForGuardian, arriveHeld, type HeldSeat } from "@/lib/services/children/checkins";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://cherrt.vercel.app").replace(/\/$/, "");
}

async function arrive(seat: HeldSeat, ctx: FlowRunContext): Promise<Transition> {
  if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
  const res = await arriveHeld(ctx.link.workspaceId, seat.id);
  if (!res.ok) return { done: { type: "text", text: "That reservation is no longer held — it may already be checked in." } };
  return {
    done: {
      type: "text",
      text: `✅ ${res.childName ?? seat.childName} is checked in. Pickup code: *${res.pickupCode ?? seat.pickupCode}*.\n🖨️ Print a name label: ${appUrl()}/label/${seat.id}`,
    },
  };
}

export const arriveFlow: FlowDefinition = {
  name: "arrive",
  firstStep: "start",
  steps: {
    start: {
      render: () => ({ type: "buttons", header: "I've arrived", text: "Check in your reserved seat(s)?", buttons: [{ id: "arrive_go", title: "Yes, check in" }] }),
      onInput: async (_input: FlowInput, _data, ctx): Promise<Transition> => {
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const held = await listHeldForGuardian(ctx.link.workspaceId, ctx.personId ?? "");
        if (!held.length) return { done: { type: "text", text: "You don't have any reserved seats. Use *Check in a child* from the Menu for a walk-in. 🙏" } };
        if (held.length === 1) return arrive(held[0], ctx); // auto-convert the only one
        return { to: "pick", patch: { held } };
      },
    },
    pick: {
      render: (data) => {
        const held = (data.held as HeldSeat[]) ?? [];
        return {
          type: "list",
          header: "I've arrived",
          text: "Which child is arriving?",
          buttonLabel: "Choose",
          rows: held.slice(0, 10).map((h, i) => ({ id: `arr_${i}`, title: h.childName.slice(0, 24), description: h.classroom ?? "" })),
        };
      },
      onInput: async (input, data, ctx): Promise<Transition> => {
        const held = (data.held as HeldSeat[]) ?? [];
        const m = /^arr_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? held[Number(m[1])] : undefined;
        if (!chosen) {
          return { stay: { type: "list", header: "I've arrived", text: "Tap the child who's arriving.", buttonLabel: "Choose", rows: held.slice(0, 10).map((h, i) => ({ id: `arr_${i}`, title: h.childName.slice(0, 24), description: h.classroom ?? "" })) } };
        }
        return arrive(chosen, ctx);
      },
    },
  },
};
