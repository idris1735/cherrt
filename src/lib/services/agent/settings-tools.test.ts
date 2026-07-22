import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: { updates: [] as Array<{ table: string; row: Record<string, unknown> }> } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      return {
        update: (row: Record<string, unknown>) => ({
          eq: (_c: string, _v: string) => {
            store.updates.push({ table, row });
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  }),
}));

import { SETTINGS_TOOLS } from "@/lib/services/agent/settings-tools";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext } from "@/lib/services/agent/tools";

const admin: AgentContext = { workspaceId: "ws1", role: "senior_pastor", userName: "Pastor" };
const tool = SETTINGS_TOOLS.find((t) => t.name === "set_church_personality")!;

beforeEach(() => {
  store.updates.length = 0;
});

describe("set_church_personality", () => {
  it("is admin-gated in the registry (minRank 4)", () => {
    expect(getAgentTool("set_church_personality")?.minRank).toBe(4);
    expect(getAgentTool("set_church_personality")?.mutates).toBe(true);
  });

  it("stores a style note against the workspace", async () => {
    const out = (await tool.handler({ description: "Playful and youthful, lots of Pidgin" }, admin)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.updates[0]).toMatchObject({ table: "workspaces", row: { agent_persona: "Playful and youthful, lots of Pidgin" } });
  });

  it("clears the persona on 'reset'", async () => {
    await tool.handler({ description: "reset" }, admin);
    expect(store.updates[0].row).toMatchObject({ agent_persona: null });
  });

  it("rejects an empty note and an over-long one", async () => {
    expect(((await tool.handler({ description: "" }, admin)) as { error?: string }).error).toBeTruthy();
    expect(((await tool.handler({ description: "x".repeat(801) }, admin)) as { error?: string }).error).toBeTruthy();
    expect(store.updates).toHaveLength(0);
  });
});
