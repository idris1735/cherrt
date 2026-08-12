import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
    people: [] as { id: string; full_name: string }[],
    contacts: [] as { person_id: string; phone_number: string; status: string }[],
  },
}));

function builder(tableName: string, rows: unknown[]) {
  let filtered = [...rows];
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (k: string, v: unknown) => { filtered = filtered.filter((r: any) => r[k] === v); return api; },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null }),
    insert: (row: Record<string, unknown>) => {
      store.inserts.push({ table: tableName, row });
      const id = `new-${store.inserts.length}`;
      (rows as any[]).push({ ...row, id });
      return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id } }) }) };
    },
    update: (patch: Record<string, unknown>) => {
      store.updates.push({ table: tableName, patch });
      return { eq: () => Promise.resolve({ error: null }) };
    },
  };
  return api;
}

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table === "people") return builder("people", store.people);
      if (table === "phone_contacts") return builder("phone_contacts", store.contacts);
      if (table === "branch_memberships") return builder("branch_memberships", []);
      return builder(table, []);
    },
  }),
}));

import { CHURCH_TOOLS } from "@/lib/services/agent/church-tools";
import { COMMUNITY_TOOLS } from "@/lib/services/agent/community-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "senior_pastor", userName: "Pastor", phone: "234800", personId: "p1" };
const addMember = CHURCH_TOOLS.find((t) => t.name === "add_member")!;
const createEvent = COMMUNITY_TOOLS.find((t) => t.name === "create_event")!;

beforeEach(() => { store.inserts.length = 0; store.updates.length = 0; store.people.length = 0; store.contacts.length = 0; });

describe("add_member", () => {
  it("is leader-gated", () => { expect(addMember.minRank).toBe(4); expect(addMember.mutates).toBe(true); });

  it("creates a person and an active membership with the resolved role", async () => {
    const out = (await addMember.handler({ name: "Sister Grace", role: "usher" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    // ensurePerson creates a people row + phone_contact, then branch_memberships insert
    const tables = store.inserts.map((i) => i.table);
    expect(tables).toContain("people");
    expect(tables).toContain("branch_memberships");
    const membership = store.inserts.find((i) => i.table === "branch_memberships")?.row;
    expect(membership).toMatchObject({ workspace_id: "ws1", role: "dept_leader", status: "active" });
    expect(out.message).toContain("Sister Grace");
  });

  it("defaults an unknown role to member", async () => {
    await addMember.handler({ name: "Ada", role: "wizard" }, ctx);
    const membership = store.inserts.find((i) => i.table === "branch_memberships")?.row;
    expect(membership).toMatchObject({ role: "member" });
  });

  it("needs a name", async () => {
    const out = (await addMember.handler({}, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});

describe("create_event", () => {
  it("is leader-gated", () => { expect(createEvent.minRank).toBe(4); expect(createEvent.mutates).toBe(true); });

  it("inserts an event with a default venue and date", async () => {
    const out = (await createEvent.handler({ title: "Youth Night" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(store.inserts[0].table).toBe("event_records");
    expect(store.inserts[0].row).toMatchObject({ workspace_id: "ws1", title: "Youth Night", venue: "Main Auditorium" });
    expect(String(store.inserts[0].row.event_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.message).toContain("Youth Night");
  });

  it("needs a title", async () => {
    const out = (await createEvent.handler({}, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});
