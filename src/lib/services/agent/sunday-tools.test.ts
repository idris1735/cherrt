import { describe, it, expect, beforeEach, vi } from "vitest";

/* Fake Supabase covering: select→(eq…)→maybeSingle, select→(eq…)→limit(thenable),
   insert(row)→select→single, insert(row) bare, update(row)→eq, upsert(row). */
const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
    upserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    single: {} as Record<string, unknown | null>,
    list: {} as Record<string, unknown[]>,
    newId: "new-svc",
  },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const afterWrite: Record<string, unknown> = {
        select: () => afterWrite,
        eq: () => afterWrite,
        single: () => Promise.resolve({ data: store.single[table] ?? { id: store.newId }, error: null }),
        then: (res: (v: { error: null }) => void) => res({ error: null }),
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
        then: (res: (v: { data: unknown[]; error: null }) => void) => res({ data: store.list[table] ?? [], error: null }),
        insert: (row: Record<string, unknown>) => { store.inserts.push({ table, row }); return afterWrite; },
        update: (row: Record<string, unknown>) => { store.updates.push({ table, row }); return afterWrite; },
        upsert: (row: Record<string, unknown>) => { store.upserts.push({ table, row }); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
  }),
}));

import { SUNDAY_TOOLS } from "@/lib/services/agent/sunday-tools";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext } from "@/lib/services/agent/tools";

const pastor: AgentContext = { workspaceId: "ws1", role: "pastor", userName: "Pastor John", personId: "p1" };
const member: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ada", personId: "p2" };
const leader: AgentContext = { workspaceId: "ws1", role: "dept_leader", userName: "Head Usher", personId: "p3" };
const tool = (n: string) => SUNDAY_TOOLS.find((t) => t.name === n)!;

beforeEach(() => {
  store.inserts.length = 0; store.updates.length = 0; store.upserts.length = 0;
  store.single = {}; store.list = {};
});

describe("gating (the Sunday pack security decisions)", () => {
  it("gates recording/reporting/reading, leaves attendance self-service", () => {
    expect(getAgentTool("record_service_summary")?.minRank).toBe(2);
    expect(getAgentTool("get_service_summary")?.minRank).toBe(2);
    expect(getAgentTool("list_recent_services")?.minRank).toBe(2);
    expect(getAgentTool("submit_service_report")?.minRank).toBe(1);
    expect(getAgentTool("mark_attendance")?.minRank).toBeUndefined();
  });
});

describe("record_service_summary", () => {
  it("updates an existing service with the parsed fields", async () => {
    store.single["services"] = { id: "svc-1" }; // today's service exists
    const out = (await tool("record_service_summary").handler(
      { adults: 320, children: 45, firstTimers: 6, salvations: 3, preacher: "Pastor John", topic: "Faith that Works", startTime: "9:00am", endTime: "11:30am" },
      pastor,
    )) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.updates[0].table).toBe("services");
    expect(store.updates[0].row).toMatchObject({
      attendance_adults: 320, attendance_children: 45, first_timers_count: 6, salvations_count: 3,
      preacher: "Pastor John", message_topic: "Faith that Works", start_time: "9:00am", end_time: "11:30am",
    });
  });

  it("creates today's service when none exists, then updates it", async () => {
    store.single["services"] = null; // none today → getOrCreateService inserts
    await tool("record_service_summary").handler({ adults: 100 }, pastor);
    expect(store.inserts.some((i) => i.table === "services")).toBe(true);
    expect(store.updates[0].row).toMatchObject({ attendance_adults: 100 });
  });

  it("rejects an empty summary", async () => {
    store.single["services"] = { id: "svc-1" };
    const out = (await tool("record_service_summary").handler({}, pastor)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.updates).toHaveLength(0);
  });
});

describe("mark_attendance", () => {
  it("upserts the member's attendance for today's service", async () => {
    store.single["services"] = { id: "svc-1" };
    const out = (await tool("mark_attendance").handler({}, member)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.upserts[0]).toMatchObject({ table: "service_attendance", row: { workspace_id: "ws1", service_id: "svc-1", person_id: "p2", name: "Ada" } });
  });
});

describe("submit_service_report", () => {
  it("files a department report against today's service", async () => {
    store.single["services"] = { id: "svc-1" };
    const out = (await tool("submit_service_report").handler({ department: "Ushering", headcount: 320 }, leader)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts.find((i) => i.table === "service_reports")?.row).toMatchObject({
      service_id: "svc-1", department: "Ushering", headcount: 320, reporter_name: "Head Usher",
    });
  });

  it("requires a department", async () => {
    const out = (await tool("submit_service_report").handler({ department: "" }, leader)) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});

describe("get_service_summary — the pastor's roll-up", () => {
  it("returns the full picture incl. department reports and real children check-ins", async () => {
    store.single["services"] = {
      id: "svc-1", service_type: "Sunday Service", preacher: "Pastor John", message_topic: "Faith that Works",
      start_time: "9:00am", end_time: "11:30am", attendance_adults: 320, attendance_children: 45,
      first_timers_count: 6, salvations_count: 3, offering_total: 250000, notes: null,
    };
    store.list["service_reports"] = [
      { department: "Ushering", headcount: 320, reporter_name: "Head Usher", details: null },
      { department: "Children", headcount: 45, reporter_name: "Aunty B", details: null },
    ];
    store.list["service_attendance"] = [{ id: "a1" }, { id: "a2" }];
    store.list["child_checkins"] = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];

    const out = (await tool("get_service_summary").handler({}, pastor)) as any;
    expect(out.found).toBe(true);
    expect(out).toMatchObject({
      preacher: "Pastor John", topic: "Faith that Works", attendanceAdults: 320, salvations: 3, firstTimers: 6,
      selfCheckedIn: 2, childrenCheckedIn: 3, departmentHeadcountTotal: 365,
    });
    expect(out.departmentReports).toHaveLength(2);
  });

  it("reports gracefully when there's no service for the date", async () => {
    store.single["services"] = null;
    const out = (await tool("get_service_summary").handler({ date: "2026-01-01" }, pastor)) as { found: boolean };
    expect(out.found).toBe(false);
  });
});

describe("list_recent_services", () => {
  it("returns recent services with headline numbers", async () => {
    store.list["services"] = [
      { service_date: "2026-07-19", service_type: "Sunday Service", attendance_adults: 300, salvations_count: 2 },
      { service_date: "2026-07-12", service_type: "Sunday Service", attendance_adults: 290, salvations_count: 1 },
    ];
    const out = (await tool("list_recent_services").handler({}, pastor)) as { count: number };
    expect(out.count).toBe(2);
  });
});
