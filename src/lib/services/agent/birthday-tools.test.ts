import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { updates: [] as any[], list: {} as Record<string, any[]> } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const after: any = { select: () => after, eq: () => after, then: (r: any) => r({ error: null }) };
      const chain: any = {
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
        then: (r: any) => r({ data: store.list[table] ?? [], error: null }),
        update: (row: any) => { store.updates.push({ table, row }); return after; },
      };
      return chain;
    },
  }),
}));

import { BIRTHDAY_TOOLS } from "@/lib/services/agent/birthday-tools";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext } from "@/lib/services/agent/tools";

const member: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ada", personId: "p1" };
const leader: AgentContext = { workspaceId: "ws1", role: "pastor", userName: "Pastor", personId: "p9" };
const tool = (n: string) => BIRTHDAY_TOOLS.find((t) => t.name === n)!;

beforeEach(() => { store.updates.length = 0; store.list = {}; });

describe("set_birthday", () => {
  it("saves day + month against the person", async () => {
    const out = (await tool("set_birthday").handler({ day: 14, month: 6 }, member)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.updates[0]).toMatchObject({ table: "people", row: { birth_day: 14, birth_month: 6 } });
  });
  it("rejects an invalid date and a person with no id", async () => {
    expect(((await tool("set_birthday").handler({ day: 40, month: 6 }, member)) as any).error).toBeTruthy();
    expect(((await tool("set_birthday").handler({ day: 14, month: 6 }, { workspaceId: "ws1", role: "member" })) as any).error).toBeTruthy();
    expect(store.updates).toHaveLength(0);
  });
});

describe("list_birthdays", () => {
  it("finds members with birthdays in range and is leader-gated", async () => {
    expect(getAgentTool("list_birthdays")?.minRank).toBe(2);
    expect(getAgentTool("set_birthday")?.minRank).toBeUndefined();

    const now = new Date();
    store.list["branch_memberships"] = [{ person_id: "p1" }, { person_id: "p2" }];
    store.list["people"] = [
      { full_name: "Ada", birth_day: now.getDate(), birth_month: now.getMonth() + 1 }, // today
      { full_name: "John", birth_day: (now.getDate() % 28) + 1 === now.getDate() ? 1 : 1, birth_month: (now.getMonth() % 12) + 1 === now.getMonth() + 1 ? ((now.getMonth() + 6) % 12) + 1 : 1 }, // a different month
    ];
    const out = (await tool("list_birthdays").handler({ range: "today" }, leader)) as { count: number; birthdays: any[] };
    expect(out.birthdays.some((b) => b.name === "Ada")).toBe(true);
  });
});
