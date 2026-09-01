// Announcement rail (Phase 4, admins) — title → message → confirm (broadcasts to
// EVERY member) → create_announcement. Rank-gated (minRank 4); rails call the
// handler directly, so we re-check toolAccessError before sending.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const confirmButtons = [{ id: "ann_go", title: "📢 Send to all" }, { id: "ann_cancel", title: "❌ Cancel" }];

export const announceFlow: FlowDefinition = {
  name: "announce",
  firstStep: "title",
  steps: {
    title: {
      render: () => ({ type: "text", text: "What's the announcement headline? (short — e.g. *Sunday service moved to 9am*)" }),
      onInput: (input: FlowInput): Transition => {
        const title = input.text.trim();
        if (title.length < 3) return { stay: { type: "text", text: "Give me a short headline for the announcement." } };
        return { to: "message", patch: { title } };
      },
    },
    message: {
      render: () => ({ type: "text", text: "Now the full message — what should everyone read?" }),
      onInput: (input): Transition => {
        const message = input.text.trim();
        if (message.length < 3) return { stay: { type: "text", text: "Type the announcement message." } };
        return { to: "confirm", patch: { message } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Send announcement",
        text: `This goes to *every member*:\n\n📢 *${String(data.title)}*\n${String(data.message)}\n\nSend it?`,
        buttons: confirmButtons,
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "ann_cancel") return { done: { type: "text", text: "Cancelled — nothing was sent. 🙏" } };
        if (input.buttonId !== "ann_go" && !/^(yes|y|send|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Send announcement", text: "Tap *Send to all* to broadcast, or *Cancel*.", buttons: confirmButtons } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("create_announcement");
        if (!tool) return { done: { type: "text", text: "Announcements are unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { title: data.title, message: data.message },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't send it: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "✅ Announcement sent to your members." } };
      },
    },
  },
};
