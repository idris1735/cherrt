import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { workspace: null as any, org: null as any } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: table === "workspaces" ? store.workspace : store.org }) }) }),
    }),
  }),
}));

import { churchApproved } from "@/lib/services/kyc/tiered-access";

beforeEach(() => { store.workspace = { organization_id: "org1" }; store.org = { status: "active" }; });

describe("churchApproved", () => {
  it("true when the org is active", async () => {
    expect(await churchApproved("ws1")).toBe(true);
  });
  it("false when the org exists but isn't active", async () => {
    store.org = { status: "pending_approval" };
    expect(await churchApproved("ws1")).toBe(false);
  });
  it("true when the workspace has no org (legacy/demo)", async () => {
    store.workspace = { organization_id: null };
    expect(await churchApproved("ws1")).toBe(true);
  });
});
