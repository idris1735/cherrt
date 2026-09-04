import { describe, it, expect, vi, beforeEach } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { store } = vi.hoisted(() => ({ store: { classrooms: [] as any[], child_checkins: [] as any[] } }));
function builder(rows: any[], table: string) {
  let f = [...rows];
  const api: any = {
    select: () => api,
    eq: (k: string, v: any) => { f = f.filter((r) => r[k] === v); return api; },
    in: (k: string, vs: any[]) => { f = f.filter((r) => vs.includes(r[k])); return api; },
    order: () => api,
    maybeSingle: () => Promise.resolve({ data: f[0] ?? null }),
    insert: (row: any) => { const created = { id: `new-${table}-${rows.length + 1}`, ...row }; rows.push(created); return { select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }) }; },
    then: (res: (v: { data: any[] }) => void) => res({ data: f }),
  };
  return api;
}
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({ from: (t: string) => builder((store as any)[t] ?? [], t) }),
}));

import { listClassroomsWithOccupancy, classroomHasSpace, createClassroom } from "@/lib/services/children/classrooms";

beforeEach(() => { store.classrooms = []; store.child_checkins = []; });

describe("classrooms occupancy", () => {
  it("computes occupancy and full flags from live check-ins", async () => {
    store.classrooms = [
      { id: "A", workspace_id: "ws1", name: "Nursery", capacity: 2, active: true },
      { id: "B", workspace_id: "ws1", name: "Primary", capacity: null, active: true },
    ];
    store.child_checkins = [
      { workspace_id: "ws1", classroom_id: "A", status: "checked_in" },
      { workspace_id: "ws1", classroom_id: "A", status: "checked_in" },
      { workspace_id: "ws1", classroom_id: "B", status: "picked_up" }, // not occupying
    ];
    const rooms = await listClassroomsWithOccupancy("ws1");
    const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
    expect(byId.A).toMatchObject({ occupancy: 2, capacity: 2, full: true });
    expect(byId.B).toMatchObject({ occupancy: 0, full: false });
  });

  it("classroomHasSpace is false when a capped room is full, true when uncapped", async () => {
    store.classrooms = [{ id: "A", workspace_id: "ws1", name: "Nursery", capacity: 2 }, { id: "B", workspace_id: "ws1", name: "Primary", capacity: null }];
    store.child_checkins = [
      { workspace_id: "ws1", classroom_id: "A", status: "checked_in" },
      { workspace_id: "ws1", classroom_id: "A", status: "in_class" },
    ];
    expect(await classroomHasSpace("ws1", "A")).toBe(false);
    expect(await classroomHasSpace("ws1", "B")).toBe(true);
  });

  it("createClassroom inserts and returns the id", async () => {
    const res = await createClassroom({ workspaceId: "ws1", name: "Teens", capacity: 30 });
    expect(res?.id).toBeDefined();
    expect(store.classrooms[0]).toMatchObject({ workspace_id: "ws1", name: "Teens", capacity: 30 });
  });
});
