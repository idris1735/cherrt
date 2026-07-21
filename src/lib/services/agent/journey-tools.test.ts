import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    selectData: {} as Record<string, unknown[]>,
  },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          store.inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
          resolve({ data: store.selectData[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

import { JOURNEY_TOOLS } from "@/lib/services/agent/journey-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const tool = (name: string) => JOURNEY_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.selectData = {};
});

describe("life-journey intakes", () => {
  it("start_bereavement_support records a bereavement journey with details", async () => {
    const out = (await tool("start_bereavement_support").handler({ deceased: "my father", relationship: "father" }, ctx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      table: "life_journeys",
      row: { workspace_id: "ws1", journey_type: "bereavement", person_name: "Ruth", details: { deceased: "my father", relationship: "father" } },
    });
  });

  it("register_marriage_prep records a marriage_prep journey", async () => {
    await tool("register_marriage_prep").handler({ partner: "John", weddingDate: "2026-12-01" }, ctx);
    expect(store.inserts[0].row).toMatchObject({ journey_type: "marriage_prep", details: { partner: "John", weddingDate: "2026-12-01" } });
  });

  it("register_baptism defaults the candidate to the sender", async () => {
    await tool("register_baptism").handler({}, ctx);
    expect(store.inserts[0].row).toMatchObject({ journey_type: "baptism", details: { candidate: "Ruth" } });
  });

  it("enroll_discipleship records a discipleship journey", async () => {
    const out = (await tool("enroll_discipleship").handler({}, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(store.inserts[0].row).toMatchObject({ journey_type: "discipleship", details: { convert: "Ruth" } });
    expect(out.message).toMatch(/welcome/i);
  });

  it("drops empty detail fields rather than storing blanks", async () => {
    await tool("start_bereavement_support").handler({ deceased: "my father" }, ctx);
    expect(store.inserts[0].row.details).toEqual({ deceased: "my father" });
  });
});

describe("list_life_journeys", () => {
  it("returns active journeys", async () => {
    store.selectData["life_journeys"] = [
      { journey_type: "bereavement", person_name: "Ruth", details: { deceased: "father" } },
      { journey_type: "baptism", person_name: "John", details: {} },
    ];
    const out = (await tool("list_life_journeys").handler({}, ctx)) as { count: number; journeys: Array<{ type: string }> };
    expect(out.count).toBe(2);
    expect(out.journeys[0].type).toBe("bereavement");
  });
});
