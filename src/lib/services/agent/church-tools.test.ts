import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Supabase client: records inserts, and returns configurable select data.
// The query builder is thenable so `await db.from(t).select().eq()...` resolves.
const { store } = vi.hoisted(() => ({
  store: { inserts: [] as Array<{ table: string; row: Record<string, unknown> }>, selectData: {} as Record<string, unknown[]> },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const q: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          store.inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: store.selectData[table] ?? [], error: null }),
      };
      return q;
    },
  }),
}));

import { CHURCH_TOOLS } from "@/lib/services/agent/church-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const tool = (name: string) => CHURCH_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.selectData = {};
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
});

describe("capture_first_timer", () => {
  it("records a visitor scoped to the workspace", async () => {
    const out = (await tool("capture_first_timer").handler({ name: "John", phone: "0803", invitedBy: "Ada" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      table: "first_timers",
      row: { workspace_id: "ws1", name: "John", phone: "0803", invited_by: "Ada", follow_up_status: "new" },
    });
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
