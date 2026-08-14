import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/services/kyc/admin-auth", () => ({ platformAdminEmail: adminMock }));

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.stubGlobal("fetch", fetchMock);

import { GET } from "@/app/api/admin/kyc-health/route";

const req = (auth?: string) => new Request("https://x/api/admin/kyc-health", { headers: auth ? { authorization: auth } : {} });

function stubThirdParties() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("api.resend.com")) {
      return new Response(JSON.stringify({ data: [{ name: "chertt.com", status: "verified" }] }), { status: 200 });
    }
    if (url.includes("api.withmono.com")) return new Response('{"data":[]}', { status: 200 });
    if (url.includes("graph.facebook.com")) return new Response(JSON.stringify({ display_phone_number: "234800", verified_name: "Chertt" }), { status: 200 });
    return new Response("unknown", { status: 500 });
  });
}

beforeEach(() => { vi.clearAllMocks(); adminMock.mockResolvedValue("ops@chertt.com"); });

describe("GET /api/admin/kyc-health", () => {
  it("401s a non-admin", async () => {
    adminMock.mockResolvedValue(null);
    expect((await GET(req("Bearer bad"))).status).toBe(401);
  });

  it("reports all three third parties live", async () => {
    process.env.RESEND_API_KEY = "re_ok";
    process.env.MONO_SECRET_KEY = "mk_ok";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa_ok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1001";
    stubThirdParties();
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.resend).toMatchObject({ configured: true, domains: ["chertt.com (verified)"] });
    expect(j.mono).toMatchObject({ configured: true });
    expect(j.mono.probe).toContain("OK");
    expect(j.whatsapp).toMatchObject({ configured: true });
    expect(j.whatsapp.note).toContain("234800");
    delete process.env.RESEND_API_KEY;
    delete process.env.MONO_SECRET_KEY;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  it("reports missing keys honestly (never throws)", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MONO_SECRET_KEY;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.resend.configured).toBe(false);
    expect(j.mono.configured).toBe(false);
    expect(j.whatsapp.configured).toBe(false);
    expect(j.mono.probe).toContain("not set");
  });

  it("surfaces a failing third party instead of crashing", async () => {
    process.env.RESEND_API_KEY = "re_ok";
    fetchMock.mockResolvedValue(new Response("Bad credentials", { status: 401 }));
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.resend.note).toContain("401");
    delete process.env.RESEND_API_KEY;
  });
});
