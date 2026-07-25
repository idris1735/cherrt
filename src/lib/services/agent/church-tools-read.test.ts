import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { rows: [] as Array<{ donor_name?: string; amount?: number }> } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.rows, error: null }),
      };
      return chain;
    },
  }),
}));

import { CHURCH_TOOLS } from "@/lib/services/agent/church-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const topGivers = CHURCH_TOOLS.find((t) => t.name === "get_top_givers")!;
const ctx: AgentContext = { workspaceId: "ws1", role: "senior_pastor", userName: "Idris", phone: "234800" };

beforeEach(() => { store.rows = []; });

describe("get_top_givers", () => {
  it("is leadership/finance-gated", () => {
    expect(topGivers.minRank).toBe(3);
  });

  it("aggregates by donor and returns the top givers, highest first", async () => {
    store.rows = [
      { donor_name: "Blessing", amount: 20000 },
      { donor_name: "Mary", amount: 5000 },
      { donor_name: "Blessing", amount: 30000 },
      { donor_name: "Mary", amount: 5000 },
    ];
    const out = (await topGivers.handler({}, ctx)) as { count: number; givers: Array<{ name: string; total: number }> };
    expect(out.givers[0]).toEqual({ name: "Blessing", total: 50000 });
    expect(out.givers[1]).toEqual({ name: "Mary", total: 10000 });
    expect(out.count).toBe(2);
  });

  it("labels blank donors as Anonymous", async () => {
    store.rows = [{ donor_name: "", amount: 1000 }];
    const out = (await topGivers.handler({}, ctx)) as { givers: Array<{ name: string }> };
    expect(out.givers[0].name).toBe("Anonymous");
  });
});
