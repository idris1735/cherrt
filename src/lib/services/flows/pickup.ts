// Pickup rail — a guardian collects their child. code → confirm → release_child.
// release_child verifies the sender is the registered guardian (can_pickup); the
// code alone is never enough — so this is guardian self-service, gated in the tool.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

const confirmBtns = [{ id: "pu_go", title: "✅ Release to me" }, { id: "pu_cancel", title: "❌ Cancel" }];

export const pickupFlow: FlowDefinition = {
  name: "pickup",
  firstStep: "code",
  steps: {
    code: {
      render: () => ({ type: "text", text: "🎫 Collecting a child? Send their *pickup code* (the digits on the pass)." }),
      onInput: (input: FlowInput): Transition => {
        const code = input.text.trim();
        if (!/^\d{4,8}$/.test(code)) return { stay: { type: "text", text: "Send the pickup code — just the digits." } };
        return { to: "confirm", patch: { code } };
      },
    },
    confirm: {
      render: (data) => ({ type: "buttons", header: "Pick up a child", text: `Release the child with code *${String(data.code)}* to you?`, buttons: confirmBtns }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "pu_cancel") return { done: { type: "text", text: "No problem — no release. 🙏" } };
        if (input.buttonId !== "pu_go" && !/^(yes|y|release|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Pick up a child", text: "Tap *Release to me*, or *Cancel*.", buttons: confirmBtns } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("release_child");
        if (!tool) return { done: { type: "text", text: "Pickup is unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { pickupCode: data.code },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: res.error } };
        return { done: { type: "text", text: res.message ?? "✅ Released." } };
      },
    },
  },
};
