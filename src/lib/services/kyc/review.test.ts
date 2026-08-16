import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, provisionMock, approvedTplMock, rejectedTplMock, startSetupMock } = vi.hoisted(() => ({
  store: { app: null as any, all: null as any, updates: [] as any[], inserts: [] as any[], usernameClash: false, workspace: { id: "ws1", slug: "grace", name: "Grace Chapel" }, org: { id: "org1" } },
  provisionMock: vi.fn().mockResolvedValue(true),
  approvedTplMock: vi.fn().mockResolvedValue(undefined),
  rejectedTplMock: vi.fn().mockResolvedValue(undefined),
  startSetupMock: vi.fn().mockResolvedValue("setup prompt"),
}));
vi.mock("@/lib/services/onboarding-flow", () => ({ startSetupFlow: startSetupMock }));

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({
        order: () => Promise.resolve({ data: store.all ?? (store.app ? [store.app] : []) }),
        eq: (col: string) => ({
          eq: () => ({ order: () => Promise.resolve({ data: store.app ? [store.app] : [] }) }),
          maybeSingle: () => Promise.resolve({ data: col === "username" ? (store.usernameClash ? { id: "x" } : null) : store.app }),
          order: () => Promise.resolve({ data: store.app ? [store.app] : [] }),
        }),
      }),
      insert: (row: any) => {
        store.inserts.push({ table, row });
        return { select: () => ({ single: () => Promise.resolve({ data: table === "workspaces" ? store.workspace : store.org, error: null }) }) };
      },
      update: (patch: any) => ({ eq: () => { store.updates.push({ table, patch }); return Promise.resolve({ error: null }); } }),
    }),
  }),
}));
vi.mock("@/lib/services/kyc/storage", () => ({ signedKycUrl: vi.fn().mockResolvedValue("https://signed/selfie") }));
vi.mock("@/lib/services/identity/provisioning", () => ({ provisionPersonMembership: provisionMock }));
vi.mock("@/lib/services/whatsapp-templates", () => ({ sendOrgApprovedTemplate: approvedTplMock, sendOrgRejectedTemplate: rejectedTplMock }));

import { getApplicationForReview, approveKycApplication, rejectKycApplication, listAllApplications } from "@/lib/services/kyc/review";

const pendingApp = {
  id: "k1", status: "pending", applicant_phone: "234800", church_legal_name: "Grace Chapel",
  address: "Lagos", applicant_role: "Ada Obi, Trustee", selfie_path: "k1/selfie.jpg",
  id_result: { firstname: "Ada", surname: "Obi", photoBase64: "IMG64" }, trustee_match: "match", created_at: "2026-08-09",
};

beforeEach(() => { store.app = { ...pendingApp }; store.all = null; store.updates = []; store.inserts = []; store.usernameClash = false; vi.clearAllMocks(); });

describe("listAllApplications — pipeline (Slice 5)", () => {
  it("returns every stage with chip data for at-a-glance results", async () => {
    store.all = [
      { ...pendingApp, id: "k1", status: "pending" },
      { ...pendingApp, id: "k2", status: "approved", cac_result: { company: { active: true } }, id_result: { firstname: "Ada", surname: "Obi" } },
      { ...pendingApp, id: "k3", status: "draft", cac_result: null, id_result: null, trustee_match: "unknown" },
    ];
    const rows = await listAllApplications();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.status).sort()).toEqual(["approved", "draft", "pending"]);
    expect(rows.find((r) => r.id === "k3")!.cac_result).toBeNull();
    expect(rows.find((r) => r.id === "k2")!.trustee_match).toBe("match");
  });
});

describe("getApplicationForReview", () => {
  it("returns the row with a signed selfie url and an ID-photo data url", async () => {
    const d = await getApplicationForReview("k1");
    expect(d?.selfieUrl).toBe("https://signed/selfie");
    expect(d?.idPhotoDataUrl).toBe("data:image/jpeg;base64,IMG64");
  });
});

describe("approveKycApplication", () => {
  it("provisions the church, seats the creator, notifies, marks approved", async () => {
    const r = await approveKycApplication("k1", "ops@chertt.com");
    expect(r).toMatchObject({ ok: true, workspaceSlug: "grace" });
    expect(provisionMock).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "234800", role: "creator", workspaceId: "ws1" }));
    expect(approvedTplMock).toHaveBeenCalledWith("234800", expect.any(String), "Grace Chapel");
    expect(store.updates.some((u) => u.table === "kyc_applications" && u.patch.status === "approved" && u.patch.workspace_id === "ws1")).toBe(true);
  });
  it("seeds the post-approval setup for the applicant", async () => {
    await approveKycApplication("k1", "ops@chertt.com");
    expect(startSetupMock).toHaveBeenCalledWith("234800", "org1", "ws1");
  });
  it("P2-2/P2-3 — carries the chosen username + website onto the workspace", async () => {
    store.app = { ...pendingApp, username: "GraceCC", website: "https://gracechapel.org" };
    await approveKycApplication("k1", "ops@chertt.com");
    const row = store.inserts.find((i: any) => i.table === "workspaces")!.row;
    expect(row.username).toBe("gracecc");
    expect(row.website).toBe("https://gracechapel.org");
  });
  it("P2-2 — unique-ifies a clashing username instead of failing the approval", async () => {
    store.usernameClash = true;
    store.app = { ...pendingApp, username: "daystar" };
    const r = await approveKycApplication("k1", "ops@chertt.com");
    expect(r.ok).toBe(true);
    const row = store.inserts.find((i: any) => i.table === "workspaces")!.row;
    expect(row.username).toMatch(/^daystar-[a-z0-9]{4}$/);
  });
  it("is idempotent — refuses a non-pending row", async () => {
    store.app = { ...pendingApp, status: "approved" };
    expect(await approveKycApplication("k1", "ops@chertt.com")).toMatchObject({ ok: false });
    expect(provisionMock).not.toHaveBeenCalled();
  });
});

describe("rejectKycApplication", () => {
  it("records the reason, notifies, marks rejected", async () => {
    const r = await rejectKycApplication("k1", "ops@chertt.com", "CAC name mismatch");
    expect(r.ok).toBe(true);
    expect(rejectedTplMock).toHaveBeenCalledWith("234800", "Grace Chapel", "CAC name mismatch");
    expect(store.updates.some((u) => u.patch.status === "rejected" && u.patch.reject_reason === "CAC name mismatch")).toBe(true);
  });
});
