import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Supabase client that records inserts, so action handlers can be tested
// without a live DB.
const { inserts } = vi.hoisted(() => ({ inserts: [] as Array<{ table: string; row: Record<string, unknown> }> }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { ACTION_TOOLS } from "@/lib/services/agent/actions";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "owner", userName: "Ruth" };
const tool = (name: string) => ACTION_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  inserts.length = 0;
});

describe("log_expense", () => {
  it("inserts a scoped expense row and confirms", async () => {
    const out = (await tool("log_expense").handler({ title: "Diesel", amount: 15000, department: "Ops" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("toolkit_expense_entries");
    expect(inserts[0].row).toMatchObject({ workspace_id: "ws1", title: "Diesel", amount: 15000, department: "Ops" });
  });

  it("rejects a missing/invalid amount without inserting", async () => {
    const out = (await tool("log_expense").handler({ title: "Diesel", amount: 0 }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(inserts).toHaveLength(0);
  });
});

describe("report_issue", () => {
  it("inserts a scoped issue with a normalized severity and the reporter", async () => {
    const out = (await tool("report_issue").handler({ title: "Toilet broken", severity: "HIGH" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(inserts[0].table).toBe("toolkit_issue_reports");
    expect(inserts[0].row).toMatchObject({ workspace_id: "ws1", title: "Toilet broken", severity: "high", reported_by: "Ruth" });
  });

  it("defaults an unknown severity to medium", async () => {
    await tool("report_issue").handler({ title: "Leak", severity: "urgent" }, ctx);
    expect(inserts[0].row).toMatchObject({ severity: "medium" });
  });
});

describe("track_supply", () => {
  it("inserts a scoped supply row", async () => {
    const out = (await tool("track_supply").handler({ name: "Communion cups", quantity: 40, lowAt: 10 }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(inserts[0].table).toBe("toolkit_inventory_items");
    expect(inserts[0].row).toMatchObject({ workspace_id: "ws1", name: "Communion cups", in_stock: 40, min_level: 10 });
  });

  it("rejects a missing name without inserting", async () => {
    const out = (await tool("track_supply").handler({ name: "", quantity: 5 }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(inserts).toHaveLength(0);
  });
});
