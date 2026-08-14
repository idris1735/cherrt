import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/services/kyc/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/kyc/admin-auth")>();
  return { ...actual, platformAdminEmail: adminMock };
});
vi.mock("@/lib/services/admin/foundation", () => ({
  listDataRequests: vi.fn().mockResolvedValue([{ id: "d1", kind: "deletion", status: "open" }]),
}));

import { GET as getDataRequests } from "@/app/api/admin/data-requests/route";
import { GET as getSettings } from "@/app/api/admin/settings/route";

const req = (auth?: string, path = "/x") => new Request(`https://x${path}`, { headers: auth ? { authorization: auth } : {} });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/data-requests", () => {
  it("401s a non-admin", async () => {
    adminMock.mockResolvedValue(null);
    expect((await getDataRequests(req("Bearer bad"))).status).toBe(401);
  });
  it("returns open requests by default and ?all=1 includes done", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    const res = await getDataRequests(req("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ requests: [{ id: "d1", kind: "deletion", status: "open" }] });
    const { listDataRequests } = await import("@/lib/services/admin/foundation");
    expect(listDataRequests).toHaveBeenCalledWith(200, false);
    await getDataRequests(req("Bearer good", "/x?all=1"));
    expect(listDataRequests).toHaveBeenCalledWith(200, true);
  });
});

describe("GET /api/admin/settings", () => {
  it("401s a non-admin", async () => {
    adminMock.mockResolvedValue(null);
    expect((await getSettings(req("Bearer bad"))).status).toBe(401);
  });
  it("returns the real allowlist for an admin", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    process.env.PLATFORM_ADMIN_EMAILS = "ops@chertt.com,admin@chertt.ng";
    const res = await getSettings(req("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      allowlist: ["ops@chertt.com", "admin@chertt.ng", "donotreply@chertt.com"],
      superAdmin: "ops@chertt.com",
    });
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });
});
