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
    not: (k: string, _op: string, v: any) => { filtered = filtered.filter((r) => r[k] !== v); return api; },
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

import {
  platformTrends,
  kycFunnel,
  verificationBreakdown,
  givingTrend,
  churchStats,
  activityFeed,
  platformOverview,
  memberTrend,
  listChurches,
  getChurchDetail,
  getPersonDetail,
  adminSearch,
  listDataRequests,
} from "@/lib/services/admin/foundation";

const NOW = new Date("2026-08-13T12:00:00Z");

beforeEach(() => {
  tables.organizations = [
    { id: "o1", name: "Grace", status: "active", created_at: "2026-08-10T09:00:00Z" },
    { id: "o2", name: "Hope", status: "pending_approval", created_at: "2026-08-01T09:00:00Z" },
  ];
  tables.workspaces = [
    { id: "w1", name: "Grace HQ", organization_id: "o1" },
    { id: "w2", name: "Hope HQ", organization_id: "o2" },
  ];
  tables.branch_memberships = [
    { id: "m1", person_id: "p1", workspace_id: "w1", role: "creator", status: "active", created_at: "2026-08-08T09:00:00Z" },
    { id: "m2", person_id: "p2", workspace_id: "w1", role: "member", status: "active", created_at: "2026-08-12T09:00:00Z" },
  ];
  tables.people = [
    { id: "p1", full_name: "Ada", consent_source: "onboarding_form" },
    { id: "p2", full_name: "Sam" },
    { id: "p3", full_name: "Zoe" },
  ];
  tables.phone_contacts = [
    { person_id: "p1", phone_number: "2341", status: "active", verified_at: "2026-08-01", opted_out: false },
    { person_id: "p2", phone_number: "2342", status: "active", verified_at: null, opted_out: true },
    { person_id: "p3", phone_number: "2343", status: "active", verified_at: "2026-08-02", opted_out: false },
  ];
  tables.giving_records = [
    { id: "g1", workspace_id: "w1", person_id: "p1", amount: 1000, created_at: "2026-08-10T10:00:00Z" },
    { id: "g2", workspace_id: "w1", person_id: null, amount: 500, created_at: "2026-08-12T10:00:00Z" },
    { id: "g3", workspace_id: "w2", person_id: null, amount: 200, created_at: "2026-08-13T10:00:00Z" },
  ];
  tables.kyc_applications = [
    { id: "k1", church_legal_name: "Grace", status: "approved", created_at: "2026-08-01T10:00:00Z", reviewed_at: "2026-08-02T10:00:00Z" },
    { id: "k2", church_legal_name: "Hope", status: "pending", created_at: "2026-08-12T10:00:00Z" },
    { id: "k3", church_legal_name: "Draft", status: "draft", created_at: "2026-08-13T10:00:00Z" },
    { id: "k4", church_legal_name: "Rejected", status: "rejected", created_at: "2026-08-03T10:00:00Z", reviewed_at: "2026-08-04T10:00:00Z" },
  ];
  tables.child_profiles = [{ id: "c1", person_id: "p3", workspace_id: "w1" }];
  tables.guardianships = [
    { id: "gs1", child_person_id: "p3", guardian_person_id: "p1", relationship: "parent", is_primary: true, workspace_id: "w1" },
  ];
  tables.prayer_requests = [
    { id: "q1", workspace_id: "w1", person_id: "p1", requester_name: "Ada", request: "healing", is_anonymous: false, status: "open", created_at: "2026-08-09T10:00:00Z" },
  ];
  tables.first_timers = [{ id: "f1", workspace_id: "w1", name: "John", created_at: "2026-08-09T10:00:00Z" }];
  tables.pastoral_care_requests = [
    { id: "pr1", workspace_id: "w1", person_id: "p1", requester_name: "Ada", category: "marriage", status: "open", details: null, created_at: "2026-08-09T10:00:00Z" },
    { id: "pr2", workspace_id: "w1", person_id: "p2", requester_name: "Sam", category: "health", status: "resolved", details: "prayer", created_at: "2026-08-08T10:00:00Z" },
  ];
  tables.pastoral_form_submissions = [
    { id: "s1", workspace_id: "w1", form_type: "baby_dedication", status: "submitted", created_at: "2026-08-09T10:00:00Z" },
  ];
  tables.data_requests = [
    { id: "d1", person_id: "p1", kind: "access", status: "open", note: "privacy info", created_at: "2026-08-13T09:00:00Z" },
    { id: "d2", person_id: "p2", kind: "deletion", status: "done", note: "resolved", created_at: "2026-08-12T09:00:00Z" },
  ];
});

describe("platformTrends", () => {
  it("buckets 7d daily with zero-filled days", async () => {
    const t = await platformTrends("7d", NOW);
    expect(t).toHaveLength(7);
    expect(t[0].bucket).toBe("2026-08-07");
    expect(t[0]).toEqual({ bucket: "2026-08-07", churches: 0, members: 0, giving: 0 });
    const d10 = t.find((b) => b.bucket === "2026-08-10")!;
    expect(d10).toEqual({ bucket: "2026-08-10", churches: 1, members: 0, giving: 1000 });
    const d12 = t.find((b) => b.bucket === "2026-08-12")!;
    expect(d12).toEqual({ bucket: "2026-08-12", churches: 0, members: 1, giving: 500 });
    const d13 = t.find((b) => b.bucket === "2026-08-13")!;
    expect(d13).toEqual({ bucket: "2026-08-13", churches: 0, members: 0, giving: 200 });
    const d8 = t.find((b) => b.bucket === "2026-08-08")!;
    expect(d8.members).toBe(1);
  });

  it("buckets 90d weekly (Monday start)", async () => {
    const t = await platformTrends("90d", NOW);
    const last = t[t.length - 1];
    expect(last.bucket).toBe("2026-08-10");
    expect(last).toEqual({ bucket: "2026-08-10", churches: 1, members: 1, giving: 1700 });
    const w0803 = t.find((b) => b.bucket === "2026-08-03")!;
    expect(w0803.members).toBe(1);
    expect(w0803.churches).toBe(0);
  });

  it('buckets "all" weekly from the earliest record', async () => {
    const t = await platformTrends("all", NOW);
    expect(t[0].bucket).toBe("2026-07-27"); // week of o2 (2026-08-01)
    expect(t[0].churches).toBe(1);
    expect(t[t.length - 1].bucket).toBe("2026-08-10");
    expect(t[t.length - 1].giving).toBe(1700);
  });

  it("returns [] with no data rows", async () => {
    tables.organizations = [];
    tables.branch_memberships = [];
    tables.giving_records = [];
    expect(await platformTrends("7d", NOW)).toEqual([]);
  });
});

describe("kycFunnel", () => {
  it("counts every stage", async () => {
    expect(await kycFunnel()).toEqual({ draft: 1, pending: 1, approved: 1, rejected: 1 });
  });
});

describe("verificationBreakdown", () => {
  it("splits people L0/L1/L2 (L2 = onboarding-verified)", async () => {
    expect(await verificationBreakdown()).toEqual({ l0: 1, l1: 1, l2: 1 });
  });
});

describe("givingTrend", () => {
  it("sums per bucket across all churches", async () => {
    const t = await givingTrend("7d", undefined, NOW);
    expect(t).toHaveLength(7);
    expect(t.find((b) => b.bucket === "2026-08-10")!.amount).toBe(1000);
    expect(t.find((b) => b.bucket === "2026-08-12")!.amount).toBe(500);
    expect(t.find((b) => b.bucket === "2026-08-13")!.amount).toBe(200);
    expect(t.find((b) => b.bucket === "2026-08-07")!.amount).toBe(0);
  });

  it("filters to one church's workspaces", async () => {
    const t = await givingTrend("7d", "o1", NOW);
    expect(t.find((b) => b.bucket === "2026-08-13")!.amount).toBe(0);
    expect(t.find((b) => b.bucket === "2026-08-10")!.amount).toBe(1000);
  });
});

describe("churchStats", () => {
  it("rolls up members, children, first-timers, giving, verification, pastoral, branches", async () => {
    expect(await churchStats("o1")).toEqual({
      members: 2, children: 1, firstTimers: 1, givingTotal: 1500, verifiedPct: 50, pendingPastoral: 1, branches: 1,
    });
  });
  it("returns null for an unknown church", async () => {
    expect(await churchStats("nope")).toBeNull();
  });
});

describe("memberTrend", () => {
  it("counts new memberships per bucket scoped to a church", async () => {
    const t = await memberTrend("7d", "o1", NOW);
    expect(t).toHaveLength(7);
    expect(t.find((b) => b.bucket === "2026-08-08")!.members).toBe(1);
    expect(t.find((b) => b.bucket === "2026-08-12")!.members).toBe(1);
    expect(t.find((b) => b.bucket === "2026-08-07")!.members).toBe(0);
  });
  it("zero-fills for a church with no members", async () => {
    const t = await memberTrend("7d", "o2", NOW);
    expect(t).toHaveLength(7);
    expect(t.every((b) => b.members === 0)).toBe(true);
  });
});

describe("activityFeed", () => {
  it("unifies events newest-first with drill-down links", async () => {
    const feed = await activityFeed(10);
    expect(feed[0]).toMatchObject({ type: "kyc_submitted", href: "/admin/kyc/k3" });
    expect(feed[1]).toMatchObject({ type: "data_request", href: "/admin" });
    expect(feed[2]).toMatchObject({ type: "kyc_submitted", href: "/admin/kyc/k2" });

    const member = feed.find((e) => e.type === "member_added")!;
    expect(member.title).toContain("Sam");
    expect(member.href).toBe("/admin/churches/o1");

    const ft = feed.find((e) => e.type === "first_timer")!;
    expect(ft.title).toContain("John");

    const created = feed.find((e) => e.type === "church_created")!;
    expect(created.title).toContain("Grace");
    expect(created.href).toBe("/admin/churches/o1");

    const approved = feed.find((e) => e.type === "kyc_approved")!;
    expect(approved.title).toContain("Grace");

    expect(feed.find((e) => e.type === "kyc_rejected")).toBeDefined();
    // Every event carries a timestamp for the timeline
    expect(feed.every((e) => !!e.at)).toBe(true);
  });

  it("respects the limit", async () => {
    expect(await activityFeed(3)).toHaveLength(3);
  });
});

describe("platformOverview kpis (extended)", () => {
  it("adds value + delta + sparkline per KPI (7d vs previous 7d)", async () => {
    const o = await platformOverview("7d", NOW);
    const k = o.kpis;
    expect(k.churches.value).toBe(2);
    expect(k.churches.delta).toBe(0); // o1 in this window, o2 in the previous — net 0
    expect(k.members.value).toBe(2);
    expect(k.members.delta).toBe(2);
    expect(k.giving.value).toBe(1700);
    expect(k.giving.delta).toBe(1700);
    expect(k.giving.spark).toHaveLength(7);
    expect(k.churches.spark).toHaveLength(7);
    expect(k.verifiedPct.value).toBe(67);
    expect(k.pendingKyc.value).toBe(1);
  });

  it('reports delta 0 for "all" (no previous window)', async () => {
    const o = await platformOverview("all", NOW);
    expect(o.kpis.churches.delta).toBe(0);
    expect(o.kpis.members.delta).toBe(0);
  });
});

describe("listChurches — rich columns (Slice 3)", () => {
  it("carries giving total and verified % per church", async () => {
    const list = await listChurches();
    const grace = list.find((c) => c.id === "o1")!;
    expect(grace.givingTotal).toBe(1500);
    expect(grace.verifiedPct).toBe(50);
    const hope = list.find((c) => c.id === "o2")!;
    expect(hope.givingTotal).toBe(200);
    expect(hope.verifiedPct).toBe(0);
  });
});

describe("getChurchDetail — pastoral tab (Slice 3)", () => {
  it("exposes pastoral care rows and form submissions", async () => {
    const d = await getChurchDetail("o1");
    expect(d).not.toBeNull();
    expect(d!.pastoralCareRows).toHaveLength(2);
    expect(d!.pastoralCareRows[0]).toMatchObject({ category: "marriage", status: "open" });
    expect(d!.formSubmissions).toHaveLength(1);
    expect(d!.formSubmissions[0]).toMatchObject({ formType: "baby_dedication", status: "submitted" });
  });
});

describe("getPersonDetail — richer tabs (Slice 4)", () => {
  it("exposes prayer requests, data requests, giving, and guardians", async () => {
    const p = await getPersonDetail("p1");
    expect(p).not.toBeNull();
    expect(p!.prayerRequests).toHaveLength(1);
    expect(p!.prayerRequests[0]).toMatchObject({ request: "healing", status: "open" });
    expect(p!.dataRequests).toHaveLength(1);
    expect(p!.dataRequests[0]).toMatchObject({ kind: "access" });
    expect(p!.givingRecords).toHaveLength(1);
    expect(p!.givingTotal).toBe(1000);
  });

  it("resolves the child's guardians in the family tab", async () => {
    const p = await getPersonDetail("p3");
    expect(p!.guardians).toHaveLength(1);
    expect(p!.guardians[0]).toMatchObject({ guardianName: "Ada", relationship: "parent", isPrimary: true });
  });

  it("exposes real phones + consent state for the consent panel", async () => {
    const p = await getPersonDetail("p2");
    expect(p!.phones).toHaveLength(1);
    expect(p!.phones[0]).toMatchObject({ phone: "2342", verified: false, optedOut: true });
    expect(p!.consent).toMatchObject({ optedOut: true, source: null });
  });
});

describe("adminSearch — command palette (Slice 6)", () => {  it("finds churches and people by name, case-insensitive", async () => {
    const res = await adminSearch("ada");
    expect(res.churches.length).toBe(0);
    expect(res.people.length).toBe(1);
    expect(res.people[0]).toMatchObject({ name: "Ada", href: "/admin/people/p1" });

    const res2 = await adminSearch("gra");
    expect(res2.churches.length).toBe(1);
    expect(res2.churches[0]).toMatchObject({ name: "Grace", href: "/admin/churches/o1" });
  });

  it("caps results and ignores empty queries", async () => {
    expect(await adminSearch("  ")).toEqual({ churches: [], people: [] });
    const res = await adminSearch("a");
    expect(res.people.length).toBeLessThanOrEqual(6);
    expect(res.churches.length).toBeLessThanOrEqual(6);
  });
});

describe("listDataRequests — includeDone (Slice 4d)", () => {
  it("defaults to open requests only", async () => {
    const list = await listDataRequests();
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("open");
  });
  it("includes done requests when asked", async () => {
    const list = await listDataRequests(50, true);
    expect(list).toHaveLength(2);
    expect(list.find((d) => d.status === "done")!.note).toBe("resolved");
  });
});
