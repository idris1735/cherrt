import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    eqCalls: [] as Array<{ table: string; key: string; value: string }>,
    ilikeCalls: [] as Array<{ table: string; key: string; value: string }>,
    orCalls: [] as Array<{ table: string; expr: string }>,
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
          ilike: (key: string, value: string) => {
            store.ilikeCalls.push({ table, key, value });
            return chain;
          },
          or: (expr: string) => {
            store.orCalls.push({ table, expr });
            return chain;
          },
          limit: () => chain,
          maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
          then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.list[table] ?? [], error: null }),
        };
        return chain;
      },
    };
  },
}));

import { findWorkspaceByJoinCode, findWorkspaceByUsername, findWorkspacesByName, getWorkspaceJoinCode, codeFromWorkspaceId } from "@/lib/services/whatsapp-workspace";

beforeEach(() => {
  store.eqCalls.length = 0;
  store.ilikeCalls.length = 0;
  store.orCalls.length = 0;
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

describe("findWorkspaceByUsername — P2-2 handle lookup", () => {
  it("lowercases and strips the @ prefix before the indexed lookup", async () => {
    store.single["workspaces"] = { id: "w1", slug: "daystar", name: "Daystar Christian Centre", city: "Lagos", username: "daystarcc" };
    const found = await findWorkspaceByUsername("@DaystarCC");
    expect(found).toMatchObject({ id: "w1", name: "Daystar Christian Centre" });
    expect(store.eqCalls).toEqual([{ table: "workspaces", key: "username", value: "daystarcc" }]);
  });

  it("returns null when no workspace holds the handle", async () => {
    store.single["workspaces"] = null;
    expect(await findWorkspaceByUsername("unknown_handle")).toBeNull();
  });
});

describe("findWorkspacesByName — P3-A church lookup", () => {
  it("OR-matches the meaningful token(s) and returns the enriched rows", async () => {
    store.list["workspaces"] = [
      { id: "w1", slug: "grace-ikeja", name: "Grace Chapel Ikeja", city: "Lagos", state: "Lagos", username: "graceikeja", website: null },
      { id: "w2", slug: "grace-abuja", name: "Grace Chapel Abuja", city: "Abuja", state: "FCT", username: null, website: null },
    ];
    const found = await findWorkspacesByName("grace");
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ id: "w1", state: "Lagos", username: "graceikeja" });
    expect(store.orCalls).toEqual([{ table: "workspaces", expr: "name.ilike.%grace%" }]);
  });

  it("pulls the church name out of a natural sentence (the daystar bug)", async () => {
    store.list["workspaces"] = [{ id: "w9", slug: "daystar", name: "Daystar Christian Centre", city: "Lagos", state: "Lagos", username: "daystar", website: null }];
    const found = await findWorkspacesByName("I'm unsure. But I go to daystar");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "w9", name: "Daystar Christian Centre" });
    // filler words dropped; only "daystar" survives as a token
    expect(store.orCalls).toEqual([{ table: "workspaces", expr: "name.ilike.%daystar%" }]);
  });

  it("OR-joins several meaningful tokens", async () => {
    store.list["workspaces"] = [];
    await findWorkspacesByName("living faith worldwide");
    expect(store.orCalls).toEqual([{ table: "workspaces", expr: "name.ilike.%living%,name.ilike.%faith%,name.ilike.%worldwide%" }]);
  });

  it("returns [] for an all-filler or too-short query, and with no db", async () => {
    expect(await findWorkspacesByName("ab")).toEqual([]);
    expect(store.orCalls).toEqual([]); // no usable tokens → raw branch, too short → no query
    store.dbNull = true;
    expect(await findWorkspacesByName("grace")).toEqual([]);
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
