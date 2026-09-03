// Set-birthday rail — member sets their own birthday. Parses a day+month from
// free text ("12 May", "12/05", "May 12") → set_birthday.
import type { FlowDefinition, FlowInput, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { Role } from "@/lib/types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseBirthday(s: string): { day: number; month: number } | null {
  const t = s.trim().toLowerCase();
  const ok = (d: number, m: number) => (d >= 1 && d <= 31 && m >= 1 && m <= 12 ? { day: d, month: m } : null);
  let m = t.match(/^(\d{1,2})\s*[\/\-.\s]\s*(\d{1,2})$/); // 12/05, 12-5, 12 5
  if (m) return ok(+m[1], +m[2]);
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/); // 12 May
  if (m) { const mo = MONTHS.findIndex((x) => m![2].startsWith(x)) + 1; return ok(+m[1], mo); }
  m = t.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/); // May 12
  if (m) { const mo = MONTHS.findIndex((x) => m![1].startsWith(x)) + 1; return ok(+m[2], mo); }
  return null;
}

export const setBirthdayFlow: FlowDefinition = {
  name: "set_birthday",
  firstStep: "date",
  steps: {
    date: {
      render: () => ({ type: "text", text: "🎂 When's your birthday? Send the day and month — e.g. *12 May* or *12/05*." }),
      onInput: async (input: FlowInput, _data, ctx): Promise<Transition> => {
        const bd = parseBirthday(input.text);
        if (!bd) return { stay: { type: "text", text: "I didn't catch that — send it like *12 May* or *12/05*." } };
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("set_birthday");
        if (!tool) return { done: { type: "text", text: "That's unavailable right now — please try again shortly." } };
        const denied = toolAccessError(tool, { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role });
        if (denied) return { done: { type: "text", text: denied } };
        const res = (await tool.handler(
          { day: bd.day, month: bd.month },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't save that: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "🎂 Saved — we'll remember your birthday!" } };
      },
    },
  },
};
