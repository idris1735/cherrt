import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({
  store: { inserts: [] as Array<{ table: string; rows: unknown[] }>, activeContact: null as unknown },
}));

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      insert: (rows: unknown) => {
        store.inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve({ error: null });
      },
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: store.activeContact }) }),
        }),
      }),
    }),
  }),
}));

import { provisionDemoChurch } from "@/lib/services/demo/provision-demo";

const tableInserts = (t: string) => store.inserts.filter((i) => i.table === t).flatMap((i) => i.rows) as Record<string, unknown>[];

beforeEach(() => { store.inserts.length = 0; store.activeContact = null; });

describe("provisionDemoChurch", () => {
  it("creates the church, links the phone as senior_pastor, and seeds realistic data", async () => {
    const out = await provisionDemoChurch("2348011112222", "Pastor Idris", "St Mary's Assembly");
    expect(out).not.toBeNull();
    expect(out!.link.userRole).toBe("senior_pastor");
    expect(out!.link.userName).toBe("Pastor Idris");
    expect(out!.link.workspaceName).toBe("St Mary's Assembly");

    // core provision
    expect(tableInserts("organizations").length).toBe(1);
    expect(tableInserts("workspaces")).toEqual([expect.objectContaining({ name: "St Mary's Assembly" })]);
    expect(tableInserts("branch_memberships")).toContainEqual(
      expect.objectContaining({ role: "senior_pastor", status: "active" }),
    );
    expect(tableInserts("whatsapp_phone_links")).toEqual([
      expect.objectContaining({ phone_number: "2348011112222", user_role: "senior_pastor" }),
    ]);

    // representative seed
    expect(tableInserts("giving_records").length).toBeGreaterThan(10);
    expect(tableInserts("branch_memberships").length).toBeGreaterThan(5); // pastor + seeded members
    expect(tableInserts("workflow_requests").length).toBe(2); // pending approvals
    expect(tableInserts("event_records").length).toBe(3);
  });

  it("skips provisioning when the phone is already an active contact", async () => {
    store.activeContact = { person_id: "existing-person" };
    const out = await provisionDemoChurch("2348011112222", "Idris", "X");
    expect(out).toBeNull();
    expect(tableInserts("workspaces").length).toBe(0);
  });
});
