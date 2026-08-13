import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/services/kyc/admin-auth", () => ({ platformAdminEmail: adminMock }));
vi.mock("@/lib/services/admin/foundation", () => ({
  platformOverview: vi.fn().mockResolvedValue({ churches: { total: 3 } }),
  listDataRequests: vi.fn().mockResolvedValue([]),
  platformTrends: vi.fn().mockResolvedValue([]),
  kycFunnel: vi.fn().mockResolvedValue({ draft: 0, pending: 0, approved: 0, rejected: 0 }),
  verificationBreakdown: vi.fn().mockResolvedValue({ l0: 0, l1: 0, l2: 0 }),
  activityFeed: vi.fn().mockResolvedValue([]),
  listChurches: vi.fn(),
  getChurchDetail: vi.fn(),
}));
import { platformOverview } from "@/lib/services/admin/foundation";

import { GET } from "@/app/api/admin/overview/route";
const req = (auth?: string, path = "/api/admin/overview") => new Request(`https://x${path}`, { headers: auth ? { authorization: auth } : {} });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/overview", () => {
  it("401s a non-admin", async () => { adminMock.mockResolvedValue(null); expect((await GET(req("Bearer x"))).status).toBe(401); });
  it("returns the overview for an admin", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ overview: { churches: { total: 3 } } });
  });
  it("honours ?period=7d", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    await GET(req("Bearer good", "/api/admin/overview?period=7d"));
    expect(platformOverview).toHaveBeenCalledWith("7d");
  });
  it("defaults an invalid period to 30d", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    await GET(req("Bearer good", "/api/admin/overview?period=nonsense"));
    expect(platformOverview).toHaveBeenCalledWith("30d");
  });
});
