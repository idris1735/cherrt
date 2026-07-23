import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { inserts: [] as any[], updates: [] as any[], single: {} as Record<string, any>, list: {} as Record<string, any[]> } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const after: any = { eq: () => after, then: (r: any) => r({ error: null }) };
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
        then: (r: any) => r({ data: store.list[table] ?? [], error: null }),
        insert: (row: any) => { store.inserts.push({ table, row }); return Promise.resolve({ error: null }); },
        update: (row: any) => { store.updates.push({ table, row }); return after; },
      };
      return chain;
    },
  }),
}));

import { HELPDESK_TOOLS } from "@/lib/services/agent/helpdesk-tools";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext } from "@/lib/services/agent/tools";

const member: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ada", personId: "p1" };
const secretary: AgentContext = { workspaceId: "ws1", role: "secretary", userName: "Grace", personId: "p2" };
const tool = (n: string) => HELPDESK_TOOLS.find((t) => t.name === n)!;

beforeEach(() => { store.inserts.length = 0; store.updates.length = 0; store.single = {}; store.list = {}; });

describe("gating", () => {
  it("lost&found open to members; office desk to reception/secretary", () => {
    expect(getAgentTool("report_lost_or_found")?.minRank).toBeUndefined();
    expect(getAgentTool("list_lost_found")?.minRank).toBeUndefined();
    expect(getAgentTool("register_office_guest")?.minRank).toBe(2);
    expect(getAgentTool("sign_out_office_guest")?.minRank).toBe(2);
    expect(getAgentTool("list_office_guests")?.minRank).toBe(2);
  });
});

describe("lost & found", () => {
  it("logs a lost item by default and a found item when told", async () => {
    await tool("report_lost_or_found").handler({ description: "black umbrella", location: "main hall" }, member);
    expect(store.inserts[0]).toMatchObject({ table: "lost_found_items", row: { kind: "lost", description: "black umbrella", location: "main hall" } });
    store.inserts.length = 0;
    await tool("report_lost_or_found").handler({ description: "a set of keys", kind: "found" }, member);
    expect(store.inserts[0].row).toMatchObject({ kind: "found" });
  });
});

describe("office guest sign-in", () => {
  it("registers a visitor and returns a 6-digit code", async () => {
    const out = (await tool("register_office_guest").handler({ name: "Mr Ade", purpose: "meeting", host: "Pastor" }, secretary)) as { ok: boolean; code: string };
    expect(out.ok).toBe(true);
    expect(out.code).toMatch(/^\d{6}$/);
    expect(store.inserts[0]).toMatchObject({ table: "office_guests", row: { name: "Mr Ade", status: "in" } });
  });

  it("signs a visitor out by code", async () => {
    store.single["office_guests"] = { id: "g1", name: "Mr Ade" };
    const out = (await tool("sign_out_office_guest").handler({ code: "123456" }, secretary)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.updates[0].row).toMatchObject({ status: "out" });
  });

  it("refuses an unknown sign-out code", async () => {
    store.single["office_guests"] = null;
    const out = (await tool("sign_out_office_guest").handler({ code: "000000" }, secretary)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.updates).toHaveLength(0);
  });
});
