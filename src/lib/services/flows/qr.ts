// QR rail (belong) — pick which QR → send_qr sends the scannable image in-chat.
import type { FlowDefinition, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

const KINDS: Array<{ id: string; title: string; kind: string }> = [
  { id: "qr_join", title: "Invite / join", kind: "join" },
  { id: "qr_give", title: "Giving", kind: "give" },
  { id: "qr_kids", title: "Kids check-in", kind: "kids" },
  { id: "qr_parking", title: "Parking", kind: "parking" },
  { id: "qr_prayer", title: "Prayer", kind: "prayer" },
  { id: "qr_events", title: "Events", kind: "events" },
];
const rows = () => KINDS.map((k) => ({ id: k.id, title: k.title }));

export const qrFlow: FlowDefinition = {
  name: "qr",
  firstStep: "kind",
  steps: {
    kind: {
      render: () => ({ type: "list", header: "QR codes", text: "Which QR would you like?", buttonLabel: "Choose", rows: rows() }),
      onInput: async (input, _data, ctx): Promise<Transition> => {
        const chosen = KINDS.find((k) => k.id === input.buttonId);
        if (!chosen) return { stay: { type: "list", header: "QR codes", text: "Tap the QR you want.", buttonLabel: "Choose", rows: rows() } };
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("send_qr");
        if (!tool) return { done: { type: "text", text: "QR codes are unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { kind: chosen.kind },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: res.error } };
        return { done: { type: "text", text: res.message ?? "Sent! 📲" } };
      },
    },
  },
};
