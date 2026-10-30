// Child check-in flow — the first flow on the engine.
// name → age (skippable) → allergies (skippable) → confirm → commit.
// Commit calls the existing check_in_child tool, which inserts the row, sends
// the QR pickup pass image, and returns the pickup-code message. The flow must
// not duplicate any of that.
import type { FlowDefinition, FlowInput, FlowData, Transition, FlowRunContext } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import { listClassroomsWithOccupancy, type ClassroomInfo } from "@/lib/services/children/classrooms";
import type { Role } from "@/lib/types";

function summary(data: FlowData): string {
  const name = String(data.childName ?? "");
  const bits = [`*${name}*`];
  if (data.age != null) bits.push(`age ${data.age}`);
  if (data.allergies) bits.push(`allergies: ${data.allergies}`);
  if (data.classroomName) bits.push(`room: ${String(data.classroomName)}`);
  return bits.join(", ");
}

function roomRows(rooms: ClassroomInfo[]) {
  return rooms.map((r, i) => ({
    id: `room_${i}`,
    title: r.name.slice(0, 24),
    description: r.capacity != null ? `${r.occupancy}/${r.capacity}${r.full ? " · FULL" : ""}` : `${r.occupancy} in`,
  }));
}

type MyChild = { personId: string; name: string; age?: number | null; allergies?: string | null };

// After the child is known, go to the classroom picker if the church uses rooms,
// else straight to confirm. Shared so both the "reuse registration" path and the
// legacy "ask age" path end up in the same place.
async function roomsOrConfirm(ctx: FlowRunContext, patch: FlowData): Promise<Transition> {
  const rooms = ctx.link ? await listClassroomsWithOccupancy(ctx.link.workspaceId) : [];
  if (!rooms.length) return { to: "confirm", patch };
  return { to: "classroom", patch: { ...patch, classrooms: rooms } };
}

export const childCheckinFlow: FlowDefinition = {
  name: "child_checkin",
  intro: "*👶 Check in a child* — drop your child at children's church. You'll get a pickup code + QR pass.",
  firstStep: "pick_child",
  steps: {
    // Started via startChildCheckin (processor), which seeds `myChildren` with
    // the guardian's own registered children and never starts this flow when
    // there are none. So only a registered child can be checked in.
    pick_child: {
      render: (data) => {
        const kids = (data.myChildren as MyChild[]) ?? [];
        return {
          type: "list",
          header: "Check in a child",
          text: "Which of your children are you checking in?",
          buttonLabel: "Choose",
          rows: [
            ...kids.map((k, i) => ({ id: `pc_${i}`, title: k.name.slice(0, 24) })),
            { id: "pc_new", title: "➕ A different child" },
          ],
        };
      },
      onInput: async (input: FlowInput, data: FlowData, ctx): Promise<Transition> => {
        const kids = (data.myChildren as MyChild[]) ?? [];
        if (input.buttonId === "pc_new") {
          return {
            done: {
              type: "buttons",
              text: "No problem — register them first (it takes a minute), then check them in. 🙏",
              buttons: [{ id: "menu:register_child", title: "🧒 Register a child" }],
            },
          };
        }
        const m = /^pc_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? kids[Number(m[1])] : undefined;
        if (!chosen) {
          const rows = [...kids.map((k, i) => ({ id: `pc_${i}`, title: k.name.slice(0, 24) })), { id: "pc_new", title: "➕ A different child" }];
          return { stay: { type: "list", header: "Check in a child", text: "Tap one of your children below.", buttonLabel: "Choose", rows } };
        }
        const patch: FlowData = { childName: chosen.name, childPersonId: chosen.personId };
        // CHQ-013: reuse the age/allergies captured at registration — don't make
        // the guardian type them again. Only fall back to asking age for a child
        // registered before age was stored (age == null).
        if (chosen.age == null) return { to: "age", patch };
        patch.age = chosen.age;
        patch.allergies = chosen.allergies ?? null;
        return roomsOrConfirm(ctx, patch);
      },
    },

    age: {
      // Age is REQUIRED (client feedback 2026-09-12) — it decides the class.
      render: (data) => ({
        type: "text",
        text: `How old is ${String(data.childName)}? Send a number (0–18).`,
      }),
      onInput: (input): Transition => {
        const n = Number(input.text.trim());
        if (!Number.isFinite(n) || n < 0 || n > 18) {
          return { stay: { type: "text", text: "Please send an age between 0 and 18." } };
        }
        return { to: "allergies", patch: { age: Math.floor(n) } };
      },
    },

    allergies: {
      render: () => ({
        type: "buttons",
        header: "Child check-in",
        text: "Any *allergies or medical notes* the children's team should know? Type them, or tap *None*.",
        buttons: [{ id: "flow_none", title: "None" }],
      }),
      onInput: async (input, _data, ctx): Promise<Transition> => {
        const allergies = input.buttonId === "flow_none" ? null : input.text.trim() || null;
        // If the church has set up classrooms, pick one (with live capacity);
        // otherwise skip straight to confirm (backward compatible).
        const rooms = ctx.link ? await listClassroomsWithOccupancy(ctx.link.workspaceId) : [];
        if (!rooms.length) return { to: "confirm", patch: { allergies } };
        return { to: "classroom", patch: { allergies, classrooms: rooms } };
      },
    },

    classroom: {
      render: (data) => {
        const rooms = (data.classrooms as ClassroomInfo[]) ?? [];
        return { type: "list", header: "Which classroom?", text: `Where should ${String(data.childName)} go?`, buttonLabel: "Choose", rows: roomRows(rooms) };
      },
      onInput: (input, data): Transition => {
        const rooms = (data.classrooms as ClassroomInfo[]) ?? [];
        const m = /^room_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? rooms[Number(m[1])] : undefined;
        if (!chosen) {
          return { stay: { type: "list", header: "Which classroom?", text: "Tap a classroom below.", buttonLabel: "Choose", rows: roomRows(rooms) } };
        }
        if (chosen.full) {
          return { stay: { type: "list", header: "Which classroom?", text: `*${chosen.name}* is full — pick another room.`, buttonLabel: "Choose", rows: roomRows(rooms) } };
        }
        return { to: "confirm", patch: { classroomId: chosen.id, classroomName: chosen.name } };
      },
    },

    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm check-in",
        text: `Checking in ${summary(data)}.\n\nAll correct?`,
        buttons: [
          { id: "flow_commit", title: "✅ Check in" },
          { id: "flow_restart", title: "✏️ Start over" },
        ],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "flow_restart") {
          return { to: "pick_child", patch: { childName: undefined, childPersonId: undefined, age: undefined, allergies: undefined, classroomId: undefined, classroomName: undefined, classrooms: undefined } };
        }
        if (input.buttonId !== "flow_commit" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return {
            stay: {
              type: "buttons",
              header: "Confirm check-in",
              text: `Tap *Check in* to confirm, or *Start over*.\n\n${summary(data)}`,
              buttons: [
                { id: "flow_commit", title: "✅ Check in" },
                { id: "flow_restart", title: "✏️ Start over" },
              ],
            },
          };
        }
        // In practice this flow only starts for linked members, but the
        // context type is now nullable for guest flows — guard explicitly.
        if (!ctx.link) {
          return { done: { type: "text", text: "Please connect to your church first, then I can check your child in." } };
        }
        // Commit through the real tool — it inserts the check-in, sends the QR
        // pickup pass, and returns the pickup-code message.
        const tool = getAgentTool("check_in_child");
        if (!tool) {
          return { done: { type: "text", text: "Sorry — check-in is unavailable right now. Please try again shortly." } };
        }
        const res = (await tool.handler(
          { childName: data.childName, age: data.age ?? undefined, allergies: data.allergies ?? undefined, classroomId: data.classroomId ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't complete the check-in: ${res.error}` } };
        // Direction rail: say what happens at collection, and offer the related
        // next step (letting someone else collect).
        return {
          done: {
            type: "buttons",
            header: "Checked in",
            text: `${res.message ?? "Done."}\n\n*Next:* show the pickup code or QR when you collect ${String(data.childName)}. Got another child to check in, or someone else collecting? Tap below.`,
            buttons: [
              { id: "menu:checkin", title: "👶 Check in another" },
              { id: "menu:add_guardian", title: "🤝 Authorise pickup" },
            ],
          },
        };
      },
    },
  },
};
