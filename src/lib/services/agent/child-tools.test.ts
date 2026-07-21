import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Supabase supporting insert, chained select→maybeSingle, and update.
const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
    single: {} as Record<string, unknown | null>,
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
        update: (row: Record<string, unknown>) => {
          store.updates.push({ table, row });
          return chain;
        },
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      };
      return chain;
    },
  }),
}));

import { CHILD_TOOLS } from "@/lib/services/agent/child-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const tool = (name: string) => CHILD_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.updates.length = 0;
  store.single = {};
});

describe("check_in_child", () => {
  it("inserts a checked-in child and returns a pickup code", async () => {
    const out = (await tool("check_in_child").handler({ childName: "Timmy", age: 5, allergies: "peanuts" }, ctx)) as {
      ok: boolean;
      pickupCode: string;
      message: string;
    };
    expect(out.ok).toBe(true);
    expect(out.pickupCode).toMatch(/^\d{4}$/);
    expect(store.inserts[0]).toMatchObject({
      table: "child_checkins",
      row: { workspace_id: "ws1", child_name: "Timmy", age: 5, allergies: "peanuts", guardian_name: "Ruth", status: "checked_in" },
    });
    expect(out.message).toContain(out.pickupCode);
  });

  it("rejects a missing child name", async () => {
    const out = (await tool("check_in_child").handler({ childName: "" }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.inserts).toHaveLength(0);
  });
});

describe("lookup_child_pickup", () => {
  it("returns the child + guardian for a valid code", async () => {
    store.single["child_checkins"] = { child_name: "Timmy", age: 5, allergies: "peanuts", guardian_name: "Ruth" };
    const out = (await tool("lookup_child_pickup").handler({ pickupCode: "4821" }, ctx)) as {
      found: boolean;
      child: { name: string; guardian: string };
    };
    expect(out.found).toBe(true);
    expect(out.child).toMatchObject({ name: "Timmy", guardian: "Ruth" });
  });

  it("reports not-found for an unknown code", async () => {
    store.single["child_checkins"] = null;
    const out = (await tool("lookup_child_pickup").handler({ pickupCode: "0000" }, ctx)) as { found: boolean };
    expect(out.found).toBe(false);
  });
});

describe("release_child", () => {
  it("is confirmation-gated with a code-specific preview", () => {
    const t = tool("release_child");
    expect(t.requiresConfirmation).toBe(true);
    expect(t.preview?.({ pickupCode: "4821" })).toContain("4821");
  });

  it("marks an existing checked-in child as picked up", async () => {
    store.single["child_checkins"] = { id: "c1", child_name: "Timmy" };
    const out = (await tool("release_child").handler({ pickupCode: "4821", pickedUpBy: "Ruth" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.updates[0]).toMatchObject({ table: "child_checkins", row: { status: "picked_up", picked_up_by: "Ruth" } });
  });

  it("refuses when no checked-in child matches the code", async () => {
    store.single["child_checkins"] = null;
    const out = (await tool("release_child").handler({ pickupCode: "0000" }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.updates).toHaveLength(0);
  });
});
