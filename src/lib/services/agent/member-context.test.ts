import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: { selectData: {} as Record<string, unknown[]>, eqs: [] as Array<{ table: string; col: string; val: unknown }> },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          store.eqs.push({ table, col, val });
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.selectData[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

import { buildMemberContext } from "@/lib/services/agent/member-context";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeEach(() => {
  store.selectData = {};
  store.eqs = [];
});

describe("buildMemberContext", () => {
  it("returns an empty string when there is nothing to recall", async () => {
    expect(await buildMemberContext(ctx)).toBe("");
  });

  it("returns an empty string for an unnamed (guest) context", async () => {
    store.selectData["prayer_requests"] = [{ request: "healing", created_at: daysAgo(3) }];
    expect(await buildMemberContext({ workspaceId: "ws1", role: "member" })).toBe("");
  });

  it("summarizes recent prayer, care, journeys and giving into a memory block", async () => {
    store.selectData["prayer_requests"] = [{ request: "healing for my mum", created_at: daysAgo(10) }];
    store.selectData["pastoral_care_requests"] = [{ category: "marriage", created_at: daysAgo(30) }];
    store.selectData["life_journeys"] = [{ journey_type: "discipleship", created_at: daysAgo(20) }];
    store.selectData["giving_records"] = [{ amount: 5000, giving_type: "tithe", created_at: daysAgo(2) }];

    const out = await buildMemberContext(ctx);
    expect(out).toContain("What we remember about Ruth");
    expect(out).toContain('healing for my mum');
    expect(out).toContain("marriage");
    expect(out).toContain("discipleship");
    expect(out).toContain("₦5,000 tithe");
    // instructs the model not to recite it
    expect(out).toMatch(/never recite/i);
  });

  it("renders humane relative times", async () => {
    store.selectData["prayer_requests"] = [{ request: "traveling mercies", created_at: daysAgo(1) }];
    const out = await buildMemberContext(ctx);
    expect(out).toContain("yesterday");
  });

  it("filters by person_id (not name) when a personId is present — no same-name leak", async () => {
    store.selectData["prayer_requests"] = [{ request: "x", created_at: daysAgo(1) }];
    await buildMemberContext({ workspaceId: "ws1", role: "member", userName: "Ruth", personId: "p1" });
    const cols = store.eqs.map((e) => e.col);
    expect(cols).toContain("person_id");
    expect(store.eqs.some((e) => e.col === "person_id" && e.val === "p1")).toBe(true);
    expect(cols).not.toContain("requester_name");
    expect(cols).not.toContain("donor_name");
  });

  it("falls back to name filtering only when there is no personId (legacy)", async () => {
    store.selectData["prayer_requests"] = [{ request: "x", created_at: daysAgo(1) }];
    await buildMemberContext({ workspaceId: "ws1", role: "member", userName: "Ruth" });
    const cols = store.eqs.map((e) => e.col);
    expect(cols).toContain("requester_name");
    expect(cols).not.toContain("person_id");
  });
});
