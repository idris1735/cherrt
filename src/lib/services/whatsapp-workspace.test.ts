import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    eqCalls: [] as Array<{ table: string; key: string; value: string }>,
    single: {} as Record<string, unknown | null>,
    list: {} as Record<string, unknown[]>,
    dbNull: false,
  },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => {
    if (store.dbNull) return null;
    return {
      from(table: string) {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (key: string, value: string) => {
            store.eqCalls.push({ table, key, value });
            return chain;
          },
          maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
          then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.list[table] ?? [], error: null }),
        };
        return chain;
      },
    };
  },
}));

import { findWorkspaceByJoinCode, getWorkspaceJoinCode, codeFromWorkspaceId } from "@/lib/services/whatsapp-workspace";

beforeEach(() => {
  store.eqCalls.length = 0;
  store.single = {};
  store.list = {};
  store.dbNull = false;
});

describe("findWorkspaceByJoinCode — WS-D indexed lookup", () => {
  it("queries the stored join_code column directly (no full-table scan)", async () => {
    store.single["workspaces"] = { id: "w1", slug: "grace", name: "Grace Chapel", join_code: "AB12CD34" };
    const found = await findWorkspaceByJoinCode("ab12cd34");
    expect(found).toMatchObject({ id: "w1", slug: "grace", name: "Grace Chapel" });
    expect(store.eqCalls).toEqual([{ table: "workspaces", key: "join_code", value: "AB12CD34" }]);
  });

  it("returns null when no workspace holds the code", async () => {
    store.single["workspaces"] = null;
    expect(await findWorkspaceByJoinCode("ZZZZZZZZ")).toBeNull();
  });
});

describe("getWorkspaceJoinCode", () => {
  it("returns the stored join_code when present", async () => {
    store.single["workspaces"] = { id: "w1", join_code: "ST0RED01" };
    expect(await getWorkspaceJoinCode("w1")).toBe("ST0RED01");
  });

  it("falls back to the id derivation when the column is absent or db unavailable", async () => {
    store.single["workspaces"] = { id: "w1", join_code: null };
    const derived = codeFromWorkspaceId("abc12345-0000-0000-0000-000000000000");
    expect(await getWorkspaceJoinCode("abc12345-0000-0000-0000-000000000000")).toBe(derived);
    store.dbNull = true;
    expect(await getWorkspaceJoinCode("abc12345-0000-0000-0000-000000000000")).toBe(derived);
  });
});
