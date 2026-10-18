// Seat-hold / pre-check-in rail — reserve a child's spot ahead of time (status
// held, occupies capacity). pick a registered child → classroom (if any) →
// hold_seat. Convert with the "arrive" rail on the day.
//
// Only the guardian's OWN registered children can be reserved — seeded via
// startHoldSeat (processor) as `myChildren`, same as child check-in. This binds
// the reservation to the child's person id so pickup verifies by identity, not
// a free-text name that could block the real guardian at collection.
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { listClassroomsWithOccupancy, type ClassroomInfo } from "@/lib/services/children/classrooms";
import type { Role } from "@/lib/types";

type MyChild = { personId: string; name: string };

function childRows(kids: MyChild[]) {
  return [...kids.map((k, i) => ({ id: `pc_${i}`, title: k.name.slice(0, 24) })), { id: "pc_new", title: "➕ A different child" }];
}
function roomRows(rooms: ClassroomInfo[]) {
  return rooms.map((r, i) => ({ id: `room_${i}`, title: r.name.slice(0, 24), description: r.capacity != null ? `${r.occupancy}/${r.capacity}${r.full ? " · FULL" : ""}` : `${r.occupancy} in` }));
}

async function commitHold(data: FlowData, ctx: FlowRunContext): Promise<Transition> {
  if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
  const tool = getAgentTool("hold_seat");
  if (!tool) return { done: { type: "text", text: "Reservations are unavailable right now — please try again shortly." } };
  const res = (await tool.handler(
    { childName: data.childName, childPersonId: data.childPersonId ?? undefined, classroomId: data.classroomId ?? undefined },
    { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
  )) as { message?: string; error?: string };
  if (res.error) return { done: { type: "text", text: `Couldn't reserve the seat: ${res.error}` } };
  return { done: { type: "text", text: res.message ?? "✅ Seat reserved." } };
}

export const holdSeatFlow: FlowDefinition = {
  name: "hold_seat",
  firstStep: "pick_child",
  steps: {
    pick_child: {
      render: (data) => ({
        type: "list",
        header: "Reserve a seat",
        text: "Let's reserve a spot ahead of Sunday. 🪑\n\nWhich of your children is this for?",
        buttonLabel: "Choose",
        rows: childRows((data.myChildren as MyChild[]) ?? []),
      }),
      onInput: async (input: FlowInput, data, ctx): Promise<Transition> => {
        const kids = (data.myChildren as MyChild[]) ?? [];
        if (input.buttonId === "pc_new") {
          return { done: { type: "text", text: "No problem — reply *register my child* to add them first, then reserve a seat. 🙏" } };
        }
        const m = /^pc_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? kids[Number(m[1])] : undefined;
        if (!chosen) {
          return { stay: { type: "list", header: "Reserve a seat", text: "Tap one of your children below.", buttonLabel: "Choose", rows: childRows(kids) } };
        }
        const rooms = ctx.link ? await listClassroomsWithOccupancy(ctx.link.workspaceId) : [];
        if (!rooms.length) return { to: "confirm", patch: { childName: chosen.name, childPersonId: chosen.personId } };
        return { to: "classroom", patch: { childName: chosen.name, childPersonId: chosen.personId, classrooms: rooms } };
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
        return { to: "confirm", patch: { childName: data.childName, classroomId: chosen.id, classroomName: chosen.name } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm reservation",
        text: `Reserve a seat for *${String(data.childName)}*${data.classroomName ? ` in *${String(data.classroomName)}*` : ""}?`,
        buttons: [{ id: "hs_go", title: "✅ Reserve" }, { id: "hs_cancel", title: "❌ Cancel" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "hs_cancel") return { done: { type: "text", text: "No problem — no reservation made. 🙏" } };
        if (input.buttonId !== "hs_go" && !/^(yes|y|confirm|reserve)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm reservation", text: "Tap *Reserve* to confirm, or *Cancel*.", buttons: [{ id: "hs_go", title: "✅ Reserve" }, { id: "hs_cancel", title: "❌ Cancel" }] } };
        }
        return commitHold(data, ctx);
      },
    },
  },
};
