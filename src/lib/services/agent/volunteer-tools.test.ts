import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { inserts: [] as any[], upserts: [] as any[], list: {} as Record<string, any[]> } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: any = {
        select: () => chain, eq: () => chain, ilike: () => chain, order: () => chain, limit: () => chain,
        then: (r: any) => r({ data: store.list[table] ?? [], error: null }),
        insert: (row: any) => { store.inserts.push({ table, row }); return Promise.resolve({ error: null }); },
        upsert: (row: any) => { store.upserts.push({ table, row }); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
  }),
}));

import { VOLUNTEER_TOOLS } from "@/lib/services/agent/volunteer-tools";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext } from "@/lib/services/agent/tools";

const leader: AgentContext = { workspaceId: "ws1", role: "dept_leader", userName: "Head Usher", personId: "p1" };
const member: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ada", personId: "p2" };
const tool = (n: string) => VOLUNTEER_TOOLS.find((t) => t.name === n)!;

beforeEach(() => { store.inserts.length = 0; store.upserts.length = 0; store.list = {}; });

describe("volunteer gating", () => {
  it("leaders raise needs & see rosters; members list & sign up", () => {
    expect(getAgentTool("request_volunteers")?.minRank).toBe(1);
    expect(getAgentTool("get_volunteer_roster")?.minRank).toBe(1);
    expect(getAgentTool("volunteer_signup")?.minRank).toBeUndefined();
    expect(getAgentTool("list_volunteer_needs")?.minRank).toBeUndefined();
  });
});

describe("request_volunteers", () => {
  it("opens a need", async () => {
    const out = (await tool("request_volunteers").handler({ title: "Ushers", when: "Sunday", slots: 5 }, leader)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({ table: "volunteer_needs", row: { title: "Ushers", when_label: "Sunday", slots_needed: 5, status: "open" } });
  });
});

describe("volunteer_signup", () => {
  it("signs a member up to a matching open need", async () => {
    store.list["volunteer_needs"] = [{ id: "need-1", title: "Ushers" }];
    const out = (await tool("volunteer_signup").handler({ title: "ushers" }, member)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.upserts[0]).toMatchObject({ table: "volunteer_signups", row: { need_id: "need-1", person_id: "p2", name: "Ada" } });
  });
  it("reports gracefully when no open need matches", async () => {
    store.list["volunteer_needs"] = [];
    const out = (await tool("volunteer_signup").handler({ title: "choir" }, member)) as { found: boolean };
    expect(out.found).toBe(false);
    expect(store.upserts).toHaveLength(0);
  });
});

describe("get_volunteer_roster", () => {
  it("lists who signed up", async () => {
    store.list["volunteer_needs"] = [{ id: "need-1", title: "Ushers" }];
    store.list["volunteer_signups"] = [{ name: "Ada" }, { name: "Tunde" }];
    const out = (await tool("get_volunteer_roster").handler({ title: "ushers" }, leader)) as { count: number; volunteers: string[] };
    expect(out.count).toBe(2);
    expect(out.volunteers).toContain("Ada");
  });
});
