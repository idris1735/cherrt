import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolated from whatsapp-session.test.ts (which runs DB-less / in-memory): here
// we mock the Supabase client so the toDbRow/toSession mapping actually runs,
// proving the new demo-onboarding flow + demoRole persist round-trip.
const { store } = vi.hoisted(() => ({ store: { row: null as Record<string, unknown> | null } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) => { store.row = row; return Promise.resolve({ error: null }); },
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: store.row }) }) }),
    }),
  }),
}));

import { getSession, updateSession, resetSessions } from "@/lib/services/whatsapp-session";

const PHONE = "2348099999999";
beforeEach(() => { store.row = null; resetSessions(); });

describe("whatsapp-session demo fields", () => {
  it("round-trips a demo-onboarding flow and demoRole through the db row", async () => {
    await updateSession(PHONE, {
      onboarding: { flow: "demo-onboarding", step: "church", collected: { name: "Idris" } },
      demoRole: "finance",
    });
    expect(store.row).toMatchObject({ demo_role: "finance" });
    expect(store.row?.onboarding).toMatchObject({ flow: "demo-onboarding", step: "church" });

    resetSessions();
    const loaded = await getSession(PHONE);
    expect(loaded.demoRole).toBe("finance");
    expect(loaded.onboarding).toMatchObject({ flow: "demo-onboarding", step: "church", collected: { name: "Idris" } });
  });
});
