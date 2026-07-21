import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Supabase: records inserts; select chains (incl. ilike) are thenable and
// resolve to per-table configured data.
const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    selectData: {} as Record<string, unknown[]>,
  },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          store.inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: store.selectData[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

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
  it("creates a pending application against a matched ministry unit", async () => {
    store.selectData["ministry_units"] = [{ name: "Choir" }];
    const out = (await tool("join_department").handler({ department: "choir" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      table: "department_memberships",
      row: { workspace_id: "ws1", unit_name: "Choir", member_name: "Ruth", status: "pending" },
    });
  });

  it("falls back to the raw name when no unit matches", async () => {
    store.selectData["ministry_units"] = [];
    await tool("join_department").handler({ department: "Media Team" }, ctx);
    expect(store.inserts[0].row).toMatchObject({ unit_name: "Media Team" });
  });

  it("rejects an empty department", async () => {
    const out = (await tool("join_department").handler({ department: "" }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.inserts).toHaveLength(0);
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
