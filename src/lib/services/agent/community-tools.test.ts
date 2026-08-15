import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    selectData: {} as Record<string, unknown[]>,
  },
}));

function qb(table: string) {
  const rows = store.selectData[table] ?? [];
  const chain: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      store.inserts.push({ table, row });
      return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: "new-id" } }) }) };
    },
    select: () => chain,
    eq: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null }),
    update: (patch: Record<string, unknown>) => {
      store.inserts.push({ table, row: patch });
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return chain;
}

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({ from: (t: string) => qb(t) }),
}));
vi.mock("@/lib/services/church/referral", () => ({
  notifyLeaders: vi.fn().mockResolvedValue(undefined),
}));
const { buttonsMock } = vi.hoisted(() => ({ buttonsMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/whatsapp", () => ({ sendInteractiveButtons: buttonsMock }));

import { COMMUNITY_TOOLS } from "@/lib/services/agent/community-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const tool = (name: string) => COMMUNITY_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.selectData = {};
});

describe("register_for_event", () => {
  it("registers the sender for a matching event", async () => {
    store.selectData["event_records"] = [{ id: "e1", title: "Youth Retreat" }];
    const out = (await tool("register_for_event").handler({ eventTitle: "retreat", notes: "vegetarian" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      table: "event_registrations",
      row: { workspace_id: "ws1", event_id: "e1", event_title: "Youth Retreat", attendee_name: "Ruth", notes: "vegetarian" },
    });
  });

  it("does not register when no event matches", async () => {
    store.selectData["event_records"] = [];
    const out = (await tool("register_for_event").handler({ eventTitle: "nonexistent" }, ctx)) as { found: boolean };
    expect(out.found).toBe(false);
    expect(store.inserts).toHaveLength(0);
  });
});

describe("join_department", () => {
  it("creates a pending application linked via person_id", async () => {
    store.selectData["ministry_units"] = [{ id: "mu1", name: "Choir" }];
    const out = (await tool("join_department").handler({ department: "choir" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    // ensurePerson creates people + phone_contacts first, then department_memberships
    const deptInsert = store.inserts.find((i) => i.table === "department_memberships");
    expect(deptInsert).toBeDefined();
    expect(deptInsert!.row).toMatchObject({ workspace_id: "ws1", unit_name: "Choir", member_name: "Ruth", status: "pending" });
    expect(deptInsert!.row.person_id).toBeDefined();
    expect(deptInsert!.row.ministry_unit_id).toBe("mu1");
  });

  it("falls back to the raw name when no unit matches", async () => {
    store.selectData["ministry_units"] = [];
    await tool("join_department").handler({ department: "Media Team" }, ctx);
    const deptInsert = store.inserts.find((i) => i.table === "department_memberships");
    expect(deptInsert!.row).toMatchObject({ unit_name: "Media Team" });
  });

  it("rejects an empty department", async () => {
    const out = (await tool("join_department").handler({ department: "" }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
  });

  it("WS2 — stores the volunteer's skills + availability", async () => {
    store.selectData["ministry_units"] = [{ id: "mu1", name: "Choir" }];
    await tool("join_department").handler({ department: "choir", skills: "alto, piano", availability: "Sunday mornings" }, ctx);
    const deptInsert = store.inserts.find((i) => i.table === "department_memberships");
    expect(deptInsert!.row).toMatchObject({ skills: "alto, piano", availability: "Sunday mornings" });
  });

  it("opens a quorum approval and sends leaders tappable Approve/Decline buttons keyed by row id", async () => {
    store.selectData["ministry_units"] = [{ id: "mu1", name: "Choir" }];
    store.selectData["branch_memberships"] = [
      { person_id: "leader1", role: "pastor" }, // rank 4 → approver
      { person_id: "member1", role: "member" }, // rank 0 → not an approver
      { person_id: "leader2", role: "finance" }, // rank 3 → approver
    ];
    store.selectData["phone_contacts"] = [
      { person_id: "leader1", phone_number: "+2348001" },
      { person_id: "leader2", phone_number: "+2348002" },
      { person_id: "member1", phone_number: "+2348003" },
    ];
    await tool("join_department").handler({ department: "choir" }, ctx);
    const approval = store.inserts.find((i) => i.table === "approvals");
    expect(approval).toBeDefined();
    expect(approval!.row).toMatchObject({ kind: "dept_join", quorum: "any", workspace_id: "ws1" });
    const phones = approval!.row.approver_phones as string[];
    expect(phones).toEqual(["+2348001", "+2348002"]); // member excluded
    expect(buttonsMock).toHaveBeenCalledTimes(2);
    const [firstPhone, , firstButtons] = buttonsMock.mock.calls[0] as [string, string, Array<{ id: string }>];
    expect(firstPhone).toBe("+2348001");
    expect(firstButtons.map((b) => b.id)).toEqual(["approve_dept:new-id", "decline_dept:new-id"]);
  });
});

describe("read tools", () => {
  it("list_events returns upcoming events", async () => {
    store.selectData["event_records"] = [{ title: "Retreat", venue: "Camp", event_date: "2026-08-01" }];
    const out = (await tool("list_events").handler({}, ctx)) as { count: number };
    expect(out.count).toBe(1);
  });

  it("list_departments returns unit names", async () => {
    store.selectData["ministry_units"] = [{ name: "Choir" }, { name: "Ushering" }];
    const out = (await tool("list_departments").handler({}, ctx)) as { count: number; departments: string[] };
    expect(out.departments).toEqual(["Choir", "Ushering"]);
  });
});
