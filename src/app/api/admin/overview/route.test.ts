import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/services/kyc/admin-auth", () => ({ platformAdminEmail: adminMock }));
vi.mock("@/lib/services/admin/foundation", () => ({
  platformOverview: vi.fn().mockResolvedValue({ churches: { total: 3 } }),
  listDataRequests: vi.fn().mockResolvedValue([]),
  listChurches: vi.fn(),
  getChurchDetail: vi.fn(),
}));

import { GET } from "@/app/api/admin/overview/route";
const req = (auth?: string) => new Request("https://x/api/admin/overview", { headers: auth ? { authorization: auth } : {} });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/overview", () => {
  it("401s a non-admin", async () => { adminMock.mockResolvedValue(null); expect((await GET(req("Bearer x"))).status).toBe(401); });
  it("returns the overview for an admin", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ overview: { churches: { total: 3 } } });
  });
});
