import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { row: null as any } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ not: () => ({ maybeSingle: () => Promise.resolve({ data: store.row }) }) }) }) }) }),
  }),
}));

import { verificationLevel } from "@/lib/services/identity/verification";

beforeEach(() => { store.row = null; });

describe("verificationLevel", () => {
  it("is 1 for a person with an active verified contact", async () => {
    store.row = { id: "c1" };
    expect(await verificationLevel("p1")).toBe(1);
  });
  it("is 0 with no verified contact", async () => {
    store.row = null;
    expect(await verificationLevel("p1")).toBe(0);
  });
});
