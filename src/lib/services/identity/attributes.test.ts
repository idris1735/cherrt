import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: {
    upserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    single: {} as Record<string, unknown | null>,
    list: {} as Record<string, unknown[]>,
  },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        upsert: (row: Record<string, unknown>) => {
          store.upserts.push({ table, row });
          return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
        },
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.list[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

import { setAttribute, getAttributes, classifySpecial, normalizeAttributeKey } from "@/lib/services/identity/attributes";

beforeEach(() => {
  store.upserts.length = 0;
  store.single = {};
  store.list = {};
});

describe("classifySpecial — NDPR special categories", () => {
  it("catches health facts in either key or value", () => {
    expect(classifySpecial("health_condition", "diabetic")).toBe(true);
    expect(classifySpecial("notes", "she has asthma")).toBe(true);
    expect(classifySpecial("prefers_yoruba_service", "sunday at 8am")).toBe(false);
  });
  it("catches religion, ethnicity, politics, orientation and biometrics", () => {
    expect(classifySpecial("religion", "catholic")).toBe(true);
    expect(classifySpecial("tribe", "igbo")).toBe(true);
    expect(classifySpecial("party", "APC")).toBe(true);
    expect(classifySpecial("orientation", "gay")).toBe(true);
    expect(classifySpecial("biometric", "fingerprint")).toBe(true);
  });
});

describe("setAttribute — THE special-category guardrail", () => {
  it("REFUSES a health fact without explicit special consent (nothing stored)", async () => {
    const res = await setAttribute({ personId: "p1", workspaceId: "ws1", key: "health", value: "diabetic" });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("consent");
    expect(store.upserts).toHaveLength(0);
  });

  it("stores the health fact, tagged special, when special consent is given", async () => {
    const res = await setAttribute({ personId: "p1", workspaceId: "ws1", key: "health", value: "diabetic", consentedSpecial: true });
    expect(res.ok).toBe(true);
    expect(res.category).toBe("special");
    expect(store.upserts[0].row).toMatchObject({ category: "special", person_id: "p1" });
  });

  it("stores normal extras without special consent", async () => {
    const res = await setAttribute({ personId: "p1", key: "Prefers Yoruba Service", value: "8am service" });
    expect(res.ok).toBe(true);
    expect(res.category).toBe("normal");
    expect(store.upserts[0].row).toMatchObject({ key: "prefers_yoruba_service", value: "8am service" });
  });

  it("normalizes keys to snake_case", () => {
    expect(normalizeAttributeKey("  Ushers on Sundays!! ")).toBe("ushers_on_sundays");
  });

  it("rejects empty key or value", async () => {
    expect((await setAttribute({ personId: "p1", key: "   ", value: "x" })).ok).toBe(false);
    expect((await setAttribute({ personId: "p1", key: "x", value: "" })).ok).toBe(false);
  });
});

describe("getAttributes", () => {
  it("returns the stored notes", async () => {
    store.list["person_attributes"] = [
      { key: "prefers_yoruba_service", value: "8am", category: "normal", source: "whatsapp", created_at: "x", updated_at: "x" },
    ];
    const attrs = await getAttributes("p1");
    expect(attrs).toHaveLength(1);
    expect(attrs[0].key).toBe("prefers_yoruba_service");
  });
});
