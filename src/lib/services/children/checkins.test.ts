import { describe, it, expect, vi, beforeEach } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { store } = vi.hoisted(() => ({ store: { child_checkins: [] as any[], classrooms: [] as any[] } }));
function builder(rows: any[]) {
  let f = [...rows];
  let patch: any = null;
  const api: any = {
    select: () => api,
    eq: (k: string, v: any) => { f = f.filter((r) => r[k] === v); return api; },
    in: (k: string, vs: any[]) => { f = f.filter((r) => vs.includes(r[k])); return api; },
    order: () => api,
    limit: () => api,
    update: (p: any) => { patch = p; return api; },
    maybeSingle: () => { const row = f[0] ?? null; if (patch && row) Object.assign(row, patch); return Promise.resolve({ data: row }); },
    then: (res: (v: { data: any[] }) => void) => res({ data: f }),
  };
  return api;
}
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({ from: (t: string) => builder((store as any)[t] ?? []) }),
}));

import { listPendingArrivals, acceptArrival } from "@/lib/services/children/checkins";

beforeEach(() => { store.child_checkins = []; store.classrooms = []; });

describe("listPendingArrivals", () => {
  it("returns checked_in children (not in_class) with classroom names", async () => {
    store.child_checkins = [
      { id: "c1", workspace_id: "ws1", child_name: "Timmy", classroom_id: "A", status: "checked_in" },
      { id: "c2", workspace_id: "ws1", child_name: "Zoe", classroom_id: null, status: "checked_in" },
      { id: "c3", workspace_id: "ws1", child_name: "Ada", classroom_id: "A", status: "in_class" },
    ];
    store.classrooms = [{ id: "A", name: "Nursery" }];
    const pending = await listPendingArrivals("ws1");
    expect(pending.map((p) => p.childName).sort()).toEqual(["Timmy", "Zoe"]);
    expect(pending.find((p) => p.childName === "Timmy")?.classroom).toBe("Nursery");
    expect(pending.find((p) => p.childName === "Zoe")?.classroom).toBeNull();
  });
});

describe("acceptArrival", () => {
  it("moves a checked_in child to in_class and returns the name", async () => {
    store.child_checkins = [{ id: "c1", workspace_id: "ws1", child_name: "Timmy", status: "checked_in" }];
    const res = await acceptArrival("ws1", "c1", "Teacher");
    expect(res).toEqual({ ok: true, childName: "Timmy" });
    expect(store.child_checkins[0].status).toBe("in_class");
    expect(store.child_checkins[0].accepted_by).toBe("Teacher");
  });

  it("is a no-op on a child who isn't checked_in", async () => {
    store.child_checkins = [{ id: "c1", workspace_id: "ws1", child_name: "Timmy", status: "in_class" }];
    expect(await acceptArrival("ws1", "c1", "Teacher")).toEqual({ ok: false });
  });
});
