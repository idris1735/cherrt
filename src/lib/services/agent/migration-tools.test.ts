import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: { inserts: [] as any[], updates: [] as any[], single: {} as Record<string, any>, list: {} as Record<string, any[]> },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const after: any = { eq: () => after, then: (r: any) => r({ error: null }) };
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
        then: (r: any) => r({ data: store.list[table] ?? [], error: null }),
        insert: (row: any) => { store.inserts.push({ table, row }); return Promise.resolve({ error: null }); },
        update: (row: any) => { store.updates.push({ table, row }); return after; },
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/services/whatsapp", () => ({ sendTextMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/identity/provisioning", () => ({ migratePersonPhone: vi.fn() }));

import { migratePersonPhone } from "@/lib/services/identity/provisioning";
import { GUEST_MIGRATION_TOOLS, ADMIN_MIGRATION_TOOLS } from "@/lib/services/agent/migration-tools";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext } from "@/lib/services/agent/tools";

const guest: AgentContext = { workspaceId: "", role: "member", phone: "2348099999999" };
const admin: AgentContext = { workspaceId: "ws1", role: "senior_pastor", userName: "Pastor", personId: "pa" };
const req = GUEST_MIGRATION_TOOLS.find((t) => t.name === "request_number_migration")!;
const approve = ADMIN_MIGRATION_TOOLS.find((t) => t.name === "approve_number_migration")!;

beforeEach(() => {
  store.inserts.length = 0; store.updates.length = 0; store.single = {}; store.list = {};
  vi.clearAllMocks();
});

describe("gating", () => {
  it("guest files; only admins review/approve/reject", () => {
    expect(req.minRank).toBeUndefined();
    expect(getAgentTool("list_migration_requests")?.minRank).toBe(4);
    expect(getAgentTool("approve_number_migration")?.minRank).toBe(4);
    expect(getAgentTool("reject_number_migration")?.minRank).toBe(4);
  });
});

describe("request_number_migration (guest)", () => {
  it("resolves the person + church from the old number and files a matched request", async () => {
    store.single["phone_contacts"] = { person_id: "p7" }; // old number → person
    store.single["branch_memberships"] = { workspace_id: "ws1" }; // their church
    const out = (await req.handler({ name: "Ada", oldNumber: "08011112222" }, guest)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      table: "number_migration_requests",
      row: { new_phone: "2348099999999", claimed_name: "Ada", person_id: "p7", workspace_id: "ws1", status: "pending" },
    });
  });

  it("still files an unmatched request when the old number isn't found", async () => {
    store.single["phone_contacts"] = null;
    const out = (await req.handler({ name: "Ada", oldNumber: "08000000000" }, guest)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0].row).toMatchObject({ person_id: null, workspace_id: null });
  });

  it("needs a name and an old number", async () => {
    expect(((await req.handler({ name: "", oldNumber: "0801" }, guest)) as any).error).toBeTruthy();
    expect(((await req.handler({ name: "Ada", oldNumber: "" }, guest)) as any).error).toBeTruthy();
  });
});

describe("approve_number_migration (admin)", () => {
  function pending(id: string, personId: string | null) {
    return { id, claimed_name: "Ada", new_phone: "2348099999999", person_id: personId };
  }
  const codeOf = (id: string) => id.replace(/-/g, "").slice(0, 6).toUpperCase();

  it("re-attaches the identity to the new number on approval", async () => {
    const id = "abcdef12-0000-0000-0000-000000000000";
    store.list["number_migration_requests"] = [pending(id, "p7")];
    vi.mocked(migratePersonPhone).mockResolvedValueOnce(true);

    const out = (await approve.handler({ code: codeOf(id) }, admin)) as { ok: boolean };
    expect(migratePersonPhone).toHaveBeenCalledWith("p7", "2348099999999");
    expect(out.ok).toBe(true);
    expect(store.updates.find((u) => u.table === "number_migration_requests")?.row).toMatchObject({ status: "approved" });
  });

  it("refuses an unmatched request (no person)", async () => {
    const id = "abcdef34-0000-0000-0000-000000000000";
    store.list["number_migration_requests"] = [pending(id, null)];
    const out = (await approve.handler({ code: codeOf(id) }, admin)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(migratePersonPhone).not.toHaveBeenCalled();
  });

  it("refuses an unknown code", async () => {
    store.list["number_migration_requests"] = [];
    const out = (await approve.handler({ code: "ZZZZZZ" }, admin)) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});
