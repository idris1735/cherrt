import { describe, it, expect, vi, beforeEach } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { tables } = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));
// Minimal query builder: supports .select().eq()/.in()/.order()/.maybeSingle()/.limit()
// and resolves to { data } filtered by recorded eq()/in() constraints.
function builder(rows: any[]) {
  let filtered = [...rows];
  const api: any = {
    select: () => api,
    eq: (k: string, v: any) => { filtered = filtered.filter((r) => r[k] === v); return api; },
    in: (k: string, vs: any[]) => { filtered = filtered.filter((r) => vs.includes(r[k])); return api; },
    order: () => api,
    limit: (n: number) => { filtered = filtered.slice(0, n); return Promise.resolve({ data: filtered }); },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null }),
    then: (res: any) => res({ data: filtered }),
  };
  return api;
}
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({ from: (t: string) => builder(tables[t] ?? []) }),
}));
vi.mock("@/lib/services/identity/verification", () => ({ verificationLevel: vi.fn().mockResolvedValue(1) }));

import { platformOverview, listChurches, getChurchDetail, listPeople } from "@/lib/services/admin/foundation";

beforeEach(() => {
  tables.organizations = [
    { id: "o1", name: "Grace Chapel", status: "active", created_at: "2026-08-01", requested_city: "Lagos", approved_by: "ops@x" },
    { id: "o2", name: "Hope Center", status: "pending_approval", created_at: "2026-08-02" },
  ];
  tables.workspaces = [
    { id: "w1", name: "Grace HQ", city: "Lagos", organization_id: "o1" },
    { id: "w2", name: "Grace Ikeja", city: "Ikeja", organization_id: "o1" },
  ];
  tables.branch_memberships = [
    { id: "m1", person_id: "p1", workspace_id: "w1", role: "creator", status: "active", created_at: "2026-08-01" },
    { id: "m2", person_id: "p2", workspace_id: "w1", role: "member", status: "active", created_at: "2026-08-02" },
  ];
  tables.people = [{ id: "p1", full_name: "Ada Obi" }, { id: "p2", full_name: "Sam Eze" }];
  tables.phone_contacts = [{ person_id: "p1", phone_number: "2348001111111", status: "active", verified_at: "2026-08-01" }, { person_id: "p2", phone_number: "2348002222222", status: "active", verified_at: null }];
  tables.kyc_applications = [{ id: "k1", church_legal_name: "Grace Chapel", status: "pending", created_at: "2026-08-03", workspace_id: "w1" }];
});

describe("platformOverview", () => {
  it("counts churches, members, verified people, pending KYC", async () => {
    const o = await platformOverview();
    expect(o.churches).toEqual({ total: 2, active: 1, pending: 1 });
    expect(o.members).toBe(2);
    expect(o.people).toEqual({ verified: 1, unverified: 1 });
    expect(o.pendingKyc).toBe(1);
    expect(o.recentChurches.length).toBeGreaterThan(0);
  });
});

describe("listChurches", () => {
  it("returns each church with branch + member counts", async () => {
    const list = await listChurches();
    const grace = list.find((c) => c.id === "o1")!;
    expect(grace).toMatchObject({ name: "Grace Chapel", status: "active", branches: 2, members: 2 });
  });
});

describe("getChurchDetail", () => {
  it("assembles org + workspaces + members (with level) + kyc", async () => {
    const d = await getChurchDetail("o1");
    expect(d?.workspaces.length).toBe(2);
    expect(d?.members.map((m) => m.name).sort()).toEqual(["Ada Obi", "Sam Eze"]);
    expect(d?.members[0].level).toBe(1);
    expect(d?.kyc).toMatchObject({ id: "k1", status: "pending" });
  });
  it("returns null for an unknown church", async () => {
    expect(await getChurchDetail("nope")).toBeNull();
  });
});

describe("listPeople", () => {
  it("returns every person with their phone, verification level, and church memberships", async () => {
    const people = await listPeople();
    expect(people.length).toBe(2);
    const ada = people.find((p) => p.name === "Ada Obi")!;
    expect(ada.phones.length).toBe(1);
    expect(ada.phones[0]).toMatchObject({ phone: "2348001111111", verified: true });
    expect(ada.verified).toBe(true);
    expect(ada.churches.length).toBe(1);
    expect(ada.churches[0]).toMatchObject({ churchName: "Grace Chapel", role: "creator" });
  });
  it("marks unverified people correctly", async () => {
    const people = await listPeople();
    const sam = people.find((p) => p.name === "Sam Eze")!;
    expect(sam.verified).toBe(false);
  });
});
