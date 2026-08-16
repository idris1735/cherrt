import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/kyc/applications", () => ({ resolveByToken: vi.fn() }));
const { cacMock } = vi.hoisted(() => ({ cacMock: vi.fn() }));
vi.mock("@/lib/services/kyc/mono", () => ({ monoCacLookup: cacMock }));

import { POST } from "@/app/api/onboard/cac-verify/route";
import { resolveByToken } from "@/lib/services/kyc/applications";

function req(body: unknown): Request {
  return new Request("https://x/api/onboard/cac-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (resolveByToken as any).mockResolvedValue({ id: "k1", applicantPhone: "234800" });
});

describe("POST /api/onboard/cac-verify (P2-1)", () => {
  it("returns verified with the company name for a matching IT number", async () => {
    cacMock.mockResolvedValue({ ok: true, data: [{ id: "c1", approvedName: "GRACE CHAPEL", rcNumber: "IT 123456", classification: "IT", active: true }] });
    const res = await POST(req({ token: "t", it_number: "IT123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, verified: true, name: "GRACE CHAPEL" });
  });

  it("returns verified:false when Mono finds no matching company", async () => {
    cacMock.mockResolvedValue({ ok: true, data: [] });
    const res = await POST(req({ token: "t", it_number: "IT123456" }));
    expect(await res.json()).toMatchObject({ ok: true, verified: false });
  });

  it("returns verified:false (not an error) when Mono throws", async () => {
    cacMock.mockRejectedValue(new Error("mono down"));
    const res = await POST(req({ token: "t", it_number: "IT123456" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, verified: false });
  });

  it("rejects a malformed IT number", async () => {
    const res = await POST(req({ token: "t", it_number: "!" }));
    expect(res.status).toBe(400);
    expect(cacMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid/expired onboarding token", async () => {
    (resolveByToken as any).mockResolvedValue(null);
    const res = await POST(req({ token: "bad", it_number: "IT123456" }));
    expect(res.status).toBe(404);
    expect(cacMock).not.toHaveBeenCalled();
  });
});
