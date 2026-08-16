import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/kyc/applications", () => ({
  resolveByToken: vi.fn(),
  updateApplication: vi.fn().mockResolvedValue(true),
  runKycChecks: vi.fn().mockResolvedValue({ cac: true, id: true, trustee: "match" }),
  isUsernameTaken: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/services/kyc/email-otp", () => ({ verifyEmailOtp: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/services/kyc/storage", () => ({ uploadKycFile: vi.fn().mockResolvedValue(true) }));
const { whatsappMock } = vi.hoisted(() => ({ whatsappMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/whatsapp", () => ({ sendTextMessage: whatsappMock }));

import { POST } from "@/app/api/onboard/submit/route";
import { resolveByToken, updateApplication, runKycChecks, isUsernameTaken } from "@/lib/services/kyc/applications";
import { verifyEmailOtp } from "@/lib/services/kyc/email-otp";

function form(fields: Record<string, string>, withFile = true): Request {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
  if (withFile) fd.set("selfie", new File([new Uint8Array([1, 2, 3])], "s.jpg", { type: "image/jpeg" }));
  return new Request("https://x/api/onboard/submit", { method: "POST", body: fd });
}
const base = { token: "t", church_legal_name: "Grace", it_number: "IT1", address: "14 Salawa Street", city: "Lagos", state: "Lagos", country: "NG", applicant_role: "Ada Obi", id_type: "nin", id_number: "12345678901", email: "a@b.co", email_code: "123456", consent: "on" };

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

  it("pings the church phone on WhatsApp to prove the number is real", async () => {
    const res = await POST(form({ ...base, church_phone: "0803 123 4567" }));
    expect(res.status).toBe(200);
    expect(whatsappMock).toHaveBeenCalledWith("+2348031234567", expect.stringContaining("Chertt received"));
  });

  it("flags (not blocks) when the church WhatsApp number differs from the applicant's number", async () => {
    const res = await POST(form({ ...base, church_phone: "0803 999 9999" }));
    expect(res.status).toBe(200);
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({ church_phone_mismatch: true }));
  });

  it("stores structured location: city + country + street", async () => {
    await POST(form(base));
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({ city: "Lagos", state: "Lagos", country: "NG", address: "14 Salawa Street" }));
  });

  it("rejects a submission without a state", async () => {
    const { state, ...noState } = base;
    void state;
    const res = await POST(form(noState));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.state).toBeTruthy();
  });

  it("rejects a city that isn't in the chosen state's list", async () => {
    const res = await POST(form({ ...base, city: "Atlantis" }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.city).toBeTruthy();
  });

  it("rejects a non-Nigeria country", async () => {
    const res = await POST(form({ ...base, country: "US" }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.country).toBeTruthy();
  });

  it("stores Google Maps coordinates and lets 'Other' cities type their town", async () => {
    const res = await POST(form({ ...base, city: "Other", city_other: "Makoko Landing", address_lat: "6.4567", address_lng: "3.3903" }));
    expect(res.status).toBe(200);
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({ city: "Makoko Landing", address_lat: 6.4567, address_lng: 3.3903 }));
  });

  it("rejects a submission without a city", async () => {
    const { city, ...noCity } = base;
    void city;
    const res = await POST(form(noCity));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.city).toBeTruthy();
  });

  it("P2-2 — stores a lowercase username and P2-3 website on submit", async () => {
    const res = await POST(form({ ...base, username: "GraceCC", website: "https://gracechapel.org" }));
    expect(res.status).toBe(200);
    expect(isUsernameTaken).toHaveBeenCalledWith("gracecc");
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({ username: "gracecc", website: "https://gracechapel.org" }));
  });

  it("P2-2 — rejects a taken username before any OTP round trip", async () => {
    (isUsernameTaken as any).mockResolvedValue(true);
    const res = await POST(form({ ...base, username: "daystar" }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.username).toBeTruthy();
    expect(verifyEmailOtp).not.toHaveBeenCalled();
  });

  it("P2-3 — rejects a malformed website", async () => {
    const res = await POST(form({ ...base, website: "not a url" }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.website).toBeTruthy();
  });

  it("never fails the submission when the church phone ping fails", async () => {
    whatsappMock.mockRejectedValueOnce(new Error("unreachable"));
    const res = await POST(form({ ...base, church_phone: "0803 123 4567" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("rejects 'Other' position without a position_other value", async () => {
    const res = await POST(form({ ...base, full_name: "Ada Obi", position: "Other" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.fields.position).toContain("Tell us your position");
  });

  it("stores a custom position when Other is chosen", async () => {
    const res = await POST(form({ ...base, full_name: "Ada Obi", position: "Other", position_other: "Welfare Coordinator" }));
    expect(res.status).toBe(200);
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({
      applicant_role: "Ada Obi, Welfare Coordinator",
      applicant_position: "Welfare Coordinator",
    }));
  });

  it("rejects a single-word applicant name", async () => {
    const res = await POST(form({ ...base, full_name: "Ada" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.fields.full_name).toContain("first and last name");
  });
});
