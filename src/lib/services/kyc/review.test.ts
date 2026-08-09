import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, provisionMock, approvedTplMock, rejectedTplMock } = vi.hoisted(() => ({
  store: { app: null as any, updates: [] as any[], workspace: { id: "ws1", slug: "grace", name: "Grace Chapel" }, org: { id: "org1" } },
  provisionMock: vi.fn().mockResolvedValue(true),
  approvedTplMock: vi.fn().mockResolvedValue(undefined),
  rejectedTplMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: store.app ? [store.app] : [] }) }),
          maybeSingle: () => Promise.resolve({ data: store.app }),
          order: () => Promise.resolve({ data: store.app ? [store.app] : [] }),
        }),
      }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: table === "workspaces" ? store.workspace : store.org, error: null }) }) }),
      update: (patch: any) => ({ eq: () => { store.updates.push({ table, patch }); return Promise.resolve({ error: null }); } }),
    }),
  }),
}));
vi.mock("@/lib/services/kyc/storage", () => ({ signedKycUrl: vi.fn().mockResolvedValue("https://signed/selfie") }));
vi.mock("@/lib/services/identity/provisioning", () => ({ provisionPersonMembership: provisionMock }));
vi.mock("@/lib/services/whatsapp-templates", () => ({ sendOrgApprovedTemplate: approvedTplMock, sendOrgRejectedTemplate: rejectedTplMock }));

import { getApplicationForReview, approveKycApplication, rejectKycApplication } from "@/lib/services/kyc/review";

const pendingApp = {
  id: "k1", status: "pending", applicant_phone: "234800", church_legal_name: "Grace Chapel",
  address: "Lagos", applicant_role: "Ada Obi, Trustee", selfie_path: "k1/selfie.jpg",
  id_result: { firstname: "Ada", surname: "Obi", photoBase64: "IMG64" }, trustee_match: "match", created_at: "2026-08-09",
};

beforeEach(() => { store.app = { ...pendingApp }; store.updates = []; vi.clearAllMocks(); });

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
