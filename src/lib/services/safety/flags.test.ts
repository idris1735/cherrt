import { describe, it, expect, vi, beforeEach } from "vitest";

const { inserts, notified } = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  notified: [] as { workspaceId: string; roleAtLeast: string; message: string }[],
}));

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
vi.mock("@/lib/services/church/referral", () => ({
  notifyLeaders: vi.fn((args: { workspaceId: string; roleAtLeast: string; message: string }) => {
    notified.push(args);
    return Promise.resolve(undefined);
  }),
}));

import { flagMessage } from "@/lib/services/safety/flags";

beforeEach(() => { inserts.length = 0; notified.length = 0; });

describe("flagMessage", () => {
  it("stores the flag and escalates to leaders", async () => {
    await flagMessage({
      fromPhone: "234801", personId: "p1", workspaceId: "ws1",
      kind: "scam", reason: "urgent money request to an account", excerpt: "send ₦200k now",
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: "flagged_messages",
      row: { from_phone: "234801", person_id: "p1", workspace_id: "ws1", kind: "scam", reason: "urgent money request to an account", status: "open" },
    });
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ workspaceId: "ws1", roleAtLeast: "secretary" });
    expect(notified[0].message).toContain("scam");
  });

  it("marks safeguarding flags URGENT in the leader notification", async () => {
    await flagMessage({
      fromPhone: "234801", personId: null, workspaceId: "ws1",
      kind: "safeguarding", reason: "a child may be in danger", excerpt: "someone is hurting a child",
    });
    expect(inserts[0].row).toMatchObject({ kind: "safeguarding" });
    expect(notified[0].message).toMatch(/URGENT/i);
    expect(notified[0].message).toContain("human");
  });

  it("skips leader notification when there is no workspace", async () => {
    await flagMessage({ fromPhone: "234801", personId: null, workspaceId: null, kind: "scam", reason: "otp ask", excerpt: "send otp" });
    expect(inserts).toHaveLength(1);
    expect(notified).toHaveLength(0);
  });
});
