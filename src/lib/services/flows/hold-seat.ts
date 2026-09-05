// Seat-hold / pre-check-in rail — reserve a child's spot ahead of time (status
// held, occupies capacity). name → classroom (if any) → hold_seat. Convert with
// the "arrive" rail on the day.
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { listClassroomsWithOccupancy, type ClassroomInfo } from "@/lib/services/children/classrooms";
import type { Role } from "@/lib/types";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}
function roomRows(rooms: ClassroomInfo[]) {
  return rooms.map((r, i) => ({ id: `room_${i}`, title: r.name.slice(0, 24), description: r.capacity != null ? `${r.occupancy}/${r.capacity}${r.full ? " · FULL" : ""}` : `${r.occupancy} in` }));
}

async function commitHold(data: FlowData, ctx: FlowRunContext): Promise<Transition> {
  if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
  const tool = getAgentTool("hold_seat");
  if (!tool) return { done: { type: "text", text: "Reservations are unavailable right now — please try again shortly." } };
  const res = (await tool.handler(
    { childName: data.childName, classroomId: data.classroomId ?? undefined },
    { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
  )) as { message?: string; error?: string };
  if (res.error) return { done: { type: "text", text: `Couldn't reserve the seat: ${res.error}` } };
  return { done: { type: "text", text: res.message ?? "✅ Seat reserved." } };
}

export const holdSeatFlow: FlowDefinition = {
  name: "hold_seat",
  firstStep: "child_name",
  steps: {
    child_name: {
      render: () => ({ type: "text", text: "Let's reserve a spot ahead of Sunday. 🪑\n\nWhat's the child's *full name*?" }),
      onInput: async (input: FlowInput, _data, ctx): Promise<Transition> => {
        const name = input.text.trim().replace(/\s+/g, " ");
        if (!looksLikeName(name)) return { stay: { type: "text", text: "Please send the child's name (first and last is best)." } };
        const rooms = ctx.link ? await listClassroomsWithOccupancy(ctx.link.workspaceId) : [];
        if (!rooms.length) return commitHold({ childName: name }, ctx);
        return { to: "classroom", patch: { childName: name, classrooms: rooms } };
      },
    },
    classroom: {
      render: (data) => {
        const rooms = (data.classrooms as ClassroomInfo[]) ?? [];
        return { type: "list", header: "Reserve a seat", text: `Which classroom for ${String(data.childName)}?`, buttonLabel: "Choose", rows: roomRows(rooms) };
      },
      onInput: async (input, data, ctx): Promise<Transition> => {
        const rooms = (data.classrooms as ClassroomInfo[]) ?? [];
        const m = /^room_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? rooms[Number(m[1])] : undefined;
        if (!chosen) return { stay: { type: "list", header: "Reserve a seat", text: "Tap a classroom below.", buttonLabel: "Choose", rows: roomRows(rooms) } };
        if (chosen.full) return { stay: { type: "list", header: "Reserve a seat", text: `*${chosen.name}* is full — pick another room.`, buttonLabel: "Choose", rows: roomRows(rooms) } };
        return commitHold({ childName: data.childName, classroomId: chosen.id }, ctx);
      },
    },
  },
};
