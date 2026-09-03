// Volunteer sign-up rail — member volunteers to serve. Type the team/role →
// volunteer_signup.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

export const volunteerSignupFlow: FlowDefinition = {
  name: "volunteer_signup",
  firstStep: "what",
  steps: {
    what: {
      render: () => ({ type: "text", text: "🙋 Wonderful! What would you like to serve in? Type a team or role — e.g. choir, ushering, media, children's ministry." }),
      onInput: async (input: FlowInput, _data, ctx): Promise<Transition> => {
        const title = input.text.trim();
        if (title.length < 2) return { stay: { type: "text", text: "Tell me which team or role you'd like to serve in." } };
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("volunteer_signup");
        if (!tool) return { done: { type: "text", text: "Volunteering is unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { title },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't sign you up: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "🙌 You're signed up — thank you for serving!" } };
      },
    },
  },
};
