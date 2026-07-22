import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/services/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { recordToolAudit } from "@/lib/services/agent/audit";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth", personId: "p1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordToolAudit", () => {
  it("inserts an audit row with actor, tool, args and outcome", async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    vi.mocked(getSupabaseServerClient).mockReturnValue({
      from: (table: string) => ({ insert: (row: Record<string, unknown>) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await recordToolAudit(ctx, "record_giving", { amount: 5000 }, "denied");

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("agent_tool_audit");
    expect(inserts[0].row).toMatchObject({
      workspace_id: "ws1",
      actor_person_id: "p1",
      actor_name: "Ruth",
      actor_role: "member",
      tool_name: "record_giving",
      args: { amount: 5000 },
      outcome: "denied",
    });
  });

  it("no-ops without a DB handle and never throws", async () => {
    vi.mocked(getSupabaseServerClient).mockReturnValue(null);
    await expect(recordToolAudit(ctx, "give_now", {}, "ok")).resolves.toBeUndefined();
  });
});
