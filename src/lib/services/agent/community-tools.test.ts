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
const { buttonsMock, textMock } = vi.hoisted(() => ({
  buttonsMock: vi.fn().mockResolvedValue(undefined),
  textMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/whatsapp", () => ({ sendInteractiveButtons: buttonsMock, sendTextMessage: textMock }));

import { COMMUNITY_TOOLS } from "@/lib/services/agent/community-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth", phone: "2348010000000" };
const tool = (name: string) => COMMUNITY_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.selectData = {};
  buttonsMock.mockClear();
  textMock.mockClear();
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
    // member_phone must be captured, or the applicant can't be told the decision.
    expect(deptInsert!.row).toMatchObject({ workspace_id: "ws1", unit_name: "Choir", member_name: "Ruth", member_phone: "2348010000000", status: "pending" });
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

describe("approve_department_request / decline_department_request", () => {
  // The acting leader; a second approver + the applicant are set up so we can
  // assert everyone is notified, exactly like the button path.
  const leaderCtx: AgentContext = { workspaceId: "ws1", role: "pastor", userName: "Pastor", phone: "234LEADER_A" };

  function seedPending() {
    store.selectData["department_memberships"] = [
      { id: "m1", unit_name: "Choir", member_name: "Ada", member_phone: "234MEMBER" },
    ];
    store.selectData["approvals"] = [{ id: "a1", approver_phones: ["234LEADER_B"], decisions: [] }];
  }

  it("approves through the quorum path and notifies the member + other approvers", async () => {
    seedPending();
    const out = (await tool("approve_department_request").handler({ memberName: "Ada" }, leaderCtx)) as { ok?: boolean; message?: string };
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/Approved/);
    expect(out.message).toMatch(/Choir/);
    // the approvals row is resolved (not left orphaned "open")
    const approvalUpdate = store.inserts.find((i) => i.table === "approvals" && (i.row as { status?: string }).status === "approved");
    expect(approvalUpdate).toBeDefined();
    // the applicant is told, and the other approver is told
    const toMember = textMock.mock.calls.find((c) => c[0] === "234MEMBER");
    expect(toMember?.[1]).toMatch(/approved/i);
    expect(textMock.mock.calls.some((c) => c[0] === "234LEADER_B")).toBe(true);
  });

  it("declines through the quorum path and tells the applicant", async () => {
    seedPending();
    const out = (await tool("decline_department_request").handler({ memberName: "Ada" }, leaderCtx)) as { ok?: boolean; message?: string };
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/Declined/);
    const toMember = textMock.mock.calls.find((c) => c[0] === "234MEMBER");
    expect(toMember?.[1]).toMatch(/declined/i);
  });

  it("never does a raw name-matched status flip (no orphaned department_memberships update)", async () => {
    seedPending();
    await tool("approve_department_request").handler({ memberName: "Ada" }, leaderCtx);
    // The only department_memberships write is the by-id resolution inside
    // decideDepartmentRequest — never a bare name-matched update.
    const deptWrites = store.inserts.filter((i) => i.table === "department_memberships");
    expect(deptWrites.every((w) => (w.row as { status?: string }).status === "approved")).toBe(true);
  });

  it("errors when there is no pending request from that member", async () => {
    store.selectData["department_memberships"] = [];
    const out = (await tool("decline_department_request").handler({ memberName: "Nobody" }, leaderCtx)) as { error?: string };
    expect(out.error).toMatch(/no pending request/i);
  });

  it("reports when the request was already decided", async () => {
    store.selectData["department_memberships"] = [{ id: "m1", unit_name: "Choir", member_name: "Ada", member_phone: "234MEMBER" }];
    store.selectData["approvals"] = []; // no open approval
    const out = (await tool("approve_department_request").handler({ memberName: "Ada" }, leaderCtx)) as { error?: string };
    expect(out.error).toMatch(/already been decided/i);
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
