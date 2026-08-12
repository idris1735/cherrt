import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Supabase client: records inserts/updates, and returns configurable select data.
const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    selectData: {} as Record<string, unknown[]>,
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  },
}));

function qb(table: string, rows: unknown[]) {
  let filtered = [...rows];
  const q: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      store.inserts.push({ table, row });
      return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: "new-id" } }) }) };
    },
    select: () => q,
    eq: (_k: string, _v: unknown) => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null }),
    update: (patch: Record<string, unknown>) => {
      store.updates.push({ table, patch });
      const uq: Record<string, unknown> = {
        eq: () => uq,
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      return uq;
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: store.selectData[table] ?? filtered, error: null }),
  };
  return q;
}

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) { return qb(table, store.selectData[table] ?? []); },
  }),
}));
vi.mock("@/lib/services/church/referral", () => ({
  notifyLeaders: vi.fn().mockResolvedValue(undefined),
}));

import { CHURCH_TOOLS } from "@/lib/services/agent/church-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const tool = (name: string) => CHURCH_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.selectData = {};
  store.updates.length = 0;
});

describe("capture_prayer_request", () => {
  it("records a named request", async () => {
    const out = (await tool("capture_prayer_request").handler({ request: "healing for my mum" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      table: "prayer_requests",
      row: { workspace_id: "ws1", requester_name: "Ruth", request: "healing for my mum", is_anonymous: false },
    });
  });

  it("hides the name when anonymous", async () => {
    await tool("capture_prayer_request").handler({ request: "a private matter", anonymous: true }, ctx);
    expect(store.inserts[0].row).toMatchObject({ requester_name: "", is_anonymous: true });
  });

  it("rejects an empty request", async () => {
    const out = (await tool("capture_prayer_request").handler({ request: "" }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.inserts).toHaveLength(0);
  });

  it("calls notifyLeaders so the prayer is actually referred to a human", async () => {
    const { notifyLeaders } = await import("@/lib/services/church/referral");
    await tool("capture_prayer_request").handler({ request: "healing" }, ctx);
    expect(notifyLeaders).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws1",
      message: expect.stringContaining("prayer"),
    }));
  });

  it("reply is a fixed referral string — bot never generates spiritual content", async () => {
    const out = (await tool("capture_prayer_request").handler({ request: "healing for my mum" }, ctx)) as { ok: boolean; message: string };
    // Enforce Kola's rule: the reply must be exactly the fixed referral string.
    // No "I'll pray for you," no "God bless," no variable comfort text.
    expect(out.message).toBe("🙏 Your prayer request has been sent to the prayer team.");
    expect(out.message).not.toContain("pray for");
    expect(out.message).not.toContain("God");
    expect(out.message).not.toContain("Lord");
    expect(out.message).not.toContain("bless");
  });
});

describe("capture_first_timer", () => {
  it("records a visitor scoped to the workspace, linked via person_id", async () => {
    const out = (await tool("capture_first_timer").handler({ name: "John", phone: "0803", invitedBy: "Ada" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    // ensurePerson creates people + phone_contacts first, then first_timers
    const ft = store.inserts.find((i) => i.table === "first_timers");
    expect(ft).toBeDefined();
    expect(ft!.row).toMatchObject({ workspace_id: "ws1", name: "John", phone: "0803", invited_by: "Ada", follow_up_status: "new" });
    expect(ft!.row.person_id).toBeDefined(); // linked to identity spine
  });
});

describe("request_pastoral_care", () => {
  it("logs a care request with category and the requester", async () => {
    await tool("request_pastoral_care").handler({ category: "marriage", details: "need counselling" }, ctx);
    expect(store.inserts[0]).toMatchObject({
      table: "pastoral_care_requests",
      row: { workspace_id: "ws1", requester_name: "Ruth", category: "marriage" },
    });
  });
});

describe("convert_first_timer — auto-emits joined_membership milestone (B3)", () => {
  it("writes a joined_membership milestone on the new member's timeline", async () => {
    store.selectData["first_timers"] = [{ id: "ft1", person_id: null, name: "John", follow_up_status: "new" }];
    const out = (await tool("convert_first_timer").handler({ name: "John" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);

    const milestoneInsert = store.inserts.find((i) => i.table === "person_milestones");
    expect(milestoneInsert).toBeDefined();
    expect(milestoneInsert!.row).toMatchObject({ type: "joined_membership" });
    expect(milestoneInsert!.row.person_id).toBeDefined();
  });
});

describe("update_pastoral_form_status — auto-emits child_dedication on completion (B3)", () => {
  it("writes a child_dedication milestone when a dedication form completes", async () => {
    store.selectData["pastoral_form_submissions"] = [{ id: "s1", form_type: "baby_dedication", person_id: "p1" }];
    const out = (await tool("update_pastoral_form_status").handler({ submissionId: "s1", status: "completed" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);

    const milestoneInsert = store.inserts.find((i) => i.table === "person_milestones");
    expect(milestoneInsert).toBeDefined();
    expect(milestoneInsert!.row).toMatchObject({ type: "child_dedication", person_id: "p1" });
  });

  it("does NOT emit a milestone when completing a non-dedication form", async () => {
    store.selectData["pastoral_form_submissions"] = [{ id: "s2", form_type: "pre_marital", person_id: "p1" }];
    await tool("update_pastoral_form_status").handler({ submissionId: "s2", status: "completed" }, ctx);
    const milestoneInsert = store.inserts.find((i) => i.table === "person_milestones");
    expect(milestoneInsert).toBeUndefined();
  });

  it("does NOT emit a milestone for non-completed status changes", async () => {
    store.selectData["pastoral_form_submissions"] = [{ id: "s3", form_type: "baby_dedication", person_id: "p1" }];
    await tool("update_pastoral_form_status").handler({ submissionId: "s3", status: "reviewing" }, ctx);
    const milestoneInsert = store.inserts.find((i) => i.table === "person_milestones");
    expect(milestoneInsert).toBeUndefined();
  });
});

describe("record_giving", () => {
  it("records received giving with a normalized type", async () => {
    const out = (await tool("record_giving").handler({ amount: 5000, givingType: "TITHE" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      table: "giving_records",
      row: { workspace_id: "ws1", amount: 5000, giving_type: "tithe", donor_name: "Ruth", channel: "manual-entry" },
    });
  });

  it("falls back to 'donation' for an unknown type and rejects non-positive amounts", async () => {
    await tool("record_giving").handler({ amount: 100, givingType: "harvest" }, ctx);
    expect(store.inserts[0].row).toMatchObject({ giving_type: "donation" });

    store.inserts.length = 0;
    const bad = (await tool("record_giving").handler({ amount: 0 }, ctx)) as { error?: string };
    expect(bad.error).toBeTruthy();
    expect(store.inserts).toHaveLength(0);
  });
});

describe("church read tools", () => {
  it("list_prayer_requests masks anonymous requesters", async () => {
    store.selectData["prayer_requests"] = [
      { requester_name: "Ruth", request: "healing", is_anonymous: false },
      { requester_name: "Bola", request: "private", is_anonymous: true },
    ];
    const out = (await tool("list_prayer_requests").handler({}, ctx)) as { count: number; requests: Array<{ from: string }> };
    expect(out.count).toBe(2);
    expect(out.requests[0].from).toBe("Ruth");
    expect(out.requests[1].from).toBe("Anonymous");
  });

  it("list_first_timers returns captured visitors", async () => {
    store.selectData["first_timers"] = [{ name: "John", phone: "0803", invited_by: "Ada", follow_up_status: "new" }];
    const out = (await tool("list_first_timers").handler({}, ctx)) as { count: number };
    expect(out.count).toBe(1);
  });
});
