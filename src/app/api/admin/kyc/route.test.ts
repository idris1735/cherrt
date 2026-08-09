import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/services/kyc/admin-auth", () => ({ platformAdminEmail: adminMock }));
vi.mock("@/lib/services/kyc/review", () => ({
  listPendingApplications: vi.fn().mockResolvedValue([{ id: "k1", church_legal_name: "Grace" }]),
  getApplicationForReview: vi.fn(),
  approveKycApplication: vi.fn(),
  rejectKycApplication: vi.fn(),
}));

import { GET } from "@/app/api/admin/kyc/route";

const req = (auth?: string) => new Request("https://x/api/admin/kyc", { headers: auth ? { authorization: auth } : {} });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/kyc", () => {
  it("401s a non-admin", async () => {
    adminMock.mockResolvedValue(null);
    expect((await GET(req("Bearer bad"))).status).toBe(401);
  });
  it("returns the pending list for an admin", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applications: [{ id: "k1", church_legal_name: "Grace" }] });
  });
});
