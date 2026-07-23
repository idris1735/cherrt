import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { inserts: [] as any[], list: {} as Record<string, any[]>, ors: [] as string[] } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: any = {
        select: () => chain, eq: () => chain, limit: () => chain,
        or: (expr: string) => { store.ors.push(expr); return chain; },
        then: (r: any) => r({ data: store.list[table] ?? [], error: null }),
        insert: (row: any) => { store.inserts.push({ table, row }); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
  }),
}));

import { FAQ_TOOLS } from "@/lib/services/agent/faq-tools";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext } from "@/lib/services/agent/tools";

const admin: AgentContext = { workspaceId: "ws1", role: "secretary", userName: "Grace", personId: "p1" };
const tool = (n: string) => FAQ_TOOLS.find((t) => t.name === n)!;

beforeEach(() => { store.inserts.length = 0; store.list = {}; store.ors.length = 0; });

describe("add_faq", () => {
  it("is admin-gated and stores a knowledge article", async () => {
    expect(getAgentTool("add_faq")?.minRank).toBe(2);
    expect(getAgentTool("get_faq")?.minRank).toBeUndefined();
    const out = (await tool("add_faq").handler({ question: "What time is service?", answer: "Sundays 9am." }, admin)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({ table: "toolkit_knowledge_articles", row: { type: "faq", title: "What time is service?", body: "Sundays 9am." } });
  });
  it("requires both question and answer", async () => {
    expect(((await tool("add_faq").handler({ question: "x", answer: "" }, admin)) as any).error).toBeTruthy();
    expect(store.inserts).toHaveLength(0);
  });
});

describe("get_faq", () => {
  it("searches by a sanitized topic and returns answers", async () => {
    store.list["toolkit_knowledge_articles"] = [{ title: "What time is service?", body: "Sundays 9am." }];
    const out = (await tool("get_faq").handler({ topic: "service time, please()" }, admin)) as { count: number; answers: any[] };
    expect(out.count).toBe(1);
    expect(out.answers[0].a).toBe("Sundays 9am.");
    // the injected parens must be stripped before hitting the or() filter
    expect(store.ors[0]).toContain("service time");
    expect(store.ors[0]).not.toContain("(");
  });
});
