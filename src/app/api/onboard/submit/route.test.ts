import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/kyc/applications", () => ({
  resolveByToken: vi.fn(),
  updateApplication: vi.fn().mockResolvedValue(true),
  runKycChecks: vi.fn().mockResolvedValue({ cac: true, id: true, trustee: "match" }),
}));
vi.mock("@/lib/services/kyc/email-otp", () => ({ verifyEmailOtp: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/services/kyc/storage", () => ({ uploadKycFile: vi.fn().mockResolvedValue(true) }));

import { POST } from "@/app/api/onboard/submit/route";
import { resolveByToken, updateApplication, runKycChecks } from "@/lib/services/kyc/applications";
import { verifyEmailOtp } from "@/lib/services/kyc/email-otp";

function form(fields: Record<string, string>, withFile = true): Request {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
  if (withFile) fd.set("selfie", new File([new Uint8Array([1, 2, 3])], "s.jpg", { type: "image/jpeg" }));
  return new Request("https://x/api/onboard/submit", { method: "POST", body: fd });
}
const base = { token: "t", church_legal_name: "Grace", it_number: "IT1", address: "Lagos", applicant_role: "Ada Obi", id_type: "nin", id_number: "12345678901", email: "a@b.co", email_code: "123456", consent: "on" };

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks resets calls but NOT implementations — re-establish defaults
  (resolveByToken as any).mockResolvedValue({ id: "k1", applicantPhone: "234800" });
  (updateApplication as any).mockResolvedValue(true);
  (runKycChecks as any).mockResolvedValue({ cac: true, id: true, trustee: "match" });
  (verifyEmailOtp as any).mockResolvedValue(true);
});

describe("POST /api/onboard/submit", () => {
  it("verifies + stores + runs checks + sets pending on a good submission", async () => {
    const res = await POST(form(base));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(runKycChecks).toHaveBeenCalled();
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({ status: "pending" }));
  });

  it("rejects a bad token", async () => {
    (resolveByToken as any).mockResolvedValue(null);
    expect((await POST(form(base))).status).toBe(404);
  });

  it("rejects a wrong email code", async () => {
    (verifyEmailOtp as any).mockResolvedValue(false);
    expect((await POST(form(base))).status).toBe(400);
  });

  it("rejects missing consent", async () => {
    const { consent, ...noConsent } = base;
    void consent;
    expect((await POST(form(noConsent))).status).toBe(400);
  });

  it("P0-3: still queues as pending when runKycChecks THROWS (Mono down)", async () => {
    (runKycChecks as any).mockRejectedValue(new Error("mono down"));
    const res = await POST(form(base));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    // Still reached pending
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({ status: "pending" }));
  });
});
