import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { contact: null as any, inserts: [] as any[], updates: [] as any[] } }));
vi.mock("@/lib/services/phone", () => ({ normalizePhoneNumber: (p: string) => p }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: store.contact }) }) }) }),
      insert: (row: any) => {
        store.inserts.push({ table, row });
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "new-person" }, error: null }) }) };
      },
      update: (row: any) => ({ eq: () => ({ eq: () => { store.updates.push({ table, row }); return Promise.resolve({ error: null }); } }) }),
    }),
  }),
}));

import { ensureVerifiedPerson } from "@/lib/services/identity/provisioning";

beforeEach(() => { store.contact = null; store.inserts.length = 0; store.updates.length = 0; });

describe("ensureVerifiedPerson", () => {
  it("creates a person + verified active contact for an unknown number", async () => {
    const id = await ensureVerifiedPerson("2348012345678");
    expect(id).toBe("new-person");
    expect(store.inserts.map((i) => i.table)).toEqual(["people", "phone_contacts"]);
    expect(store.inserts[1].row).toMatchObject({ phone_number: "2348012345678", person_id: "new-person", status: "active" });
    expect(store.inserts[1].row.verified_at).toBeTruthy();
  });

  it("returns the existing person and sets verified_at when missing", async () => {
    store.contact = { person_id: "p1", verified_at: null };
    const id = await ensureVerifiedPerson("2348012345678");
    expect(id).toBe("p1");
    expect(store.inserts).toHaveLength(0);
    expect(store.updates.length).toBe(1);
  });
});
