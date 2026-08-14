import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMock, store, whatsappMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }),
  store: { rows: [] as any[] },
  whatsappMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("resend", () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: (row: any) => { store.rows.push({ ...row }); return Promise.resolve({ error: null }); },
    }),
  }),
}));
vi.mock("@/lib/services/whatsapp", () => ({ sendTextMessage: whatsappMock }));

import { sendEmailOtp, sendOnboardingOtp } from "@/lib/services/kyc/email-otp";

beforeEach(() => { store.rows.length = 0; sendMock.mockClear(); whatsappMock.mockClear(); process.env.RESEND_API_KEY = "re_test"; });

describe("sendEmailOtp", () => {
  it("stores an email OTP and sends it via Resend", async () => {
    const ok = await sendEmailOtp("pastor@grace.org");
    expect(ok).toBe(true);
    expect(store.rows[0]).toMatchObject({ phone_number: "pastor@grace.org", purpose: "email" });
    expect(sendMock).toHaveBeenCalledOnce();
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe("pastor@grace.org");
    expect(arg.html).toMatch(/\d{6}/);
  });

  it("still returns true (code stored) if email delivery throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("resend down"));
    expect(await sendEmailOtp("x@y.z")).toBe(true);
  });
});

describe("sendOnboardingOtp — P0-1 resilience", () => {
  it("delivers the code over WhatsApp even when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const { ok, channels } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(true);
    expect(channels).toContain("whatsapp");
    // WhatsApp always gets the code
    expect(whatsappMock).toHaveBeenCalledWith(
      "2348001111111",
      expect.stringContaining("Chertt verification code"),
    );
    expect(whatsappMock.mock.calls[0][1]).toMatch(/\d{6}/);
  });

  it("sends both channels when both are available", async () => {
    const { ok, channels } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(true);
    expect(channels).toEqual(["email", "whatsapp"]);
    expect(sendMock).toHaveBeenCalledOnce();
    expect(whatsappMock).toHaveBeenCalledOnce();
  });

  it("reports email as NOT sent when the Resend SDK returns an error", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "The domain is not verified" } });
    const { ok, channels } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(true);
    expect(channels).toEqual(["whatsapp"]); // honest channels — email was rejected
    expect(whatsappMock).toHaveBeenCalledOnce();
  });

  it("returns not-ok only when both channels fail", async () => {
    delete process.env.RESEND_API_KEY;
    whatsappMock.mockRejectedValueOnce(new Error("whatsapp down"));
    const { ok } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(false);
  });
});
