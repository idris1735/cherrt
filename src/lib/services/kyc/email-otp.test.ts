import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMock, store, whatsappMock, smtpMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }),
  store: { rows: [] as any[] },
  whatsappMock: vi.fn().mockResolvedValue(undefined),
  smtpMock: vi.fn().mockResolvedValue({ messageId: "smtp-1" }),
}));
vi.mock("resend", () => ({ Resend: class { emails = { send: sendMock }; } }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: smtpMock }) } }));
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

beforeEach(() => {
  store.rows.length = 0;
  sendMock.mockClear(); whatsappMock.mockClear(); smtpMock.mockClear();
  sendMock.mockResolvedValue({ data: { id: "e1" }, error: null });
  smtpMock.mockResolvedValue({ messageId: "smtp-1" });
  process.env.RESEND_API_KEY = "re_test";
  process.env.SMTP_HOST = "smtp.hostinger.com";
  process.env.SMTP_USER = "donotreply@chertt.com";
  process.env.SMTP_PASS = "smtp-pass";
});

describe("sendEmailOtp", () => {
  it("stores an email OTP and sends it via SMTP (primary channel)", async () => {
    const ok = await sendEmailOtp("pastor@grace.org");
    expect(ok).toBe(true);
    expect(store.rows[0]).toMatchObject({ phone_number: "pastor@grace.org", purpose: "email" });
    expect(smtpMock).toHaveBeenCalledOnce();
    const arg = smtpMock.mock.calls[0][0];
    expect(arg.to).toBe("pastor@grace.org");
    expect(arg.from).toBe("Chertt <donotreply@chertt.com>");
    expect(arg.html).toMatch(/\d{6}/);
    expect(sendMock).not.toHaveBeenCalled(); // SMTP was enough
  });

  it("falls back to Resend when SMTP fails", async () => {
    smtpMock.mockRejectedValueOnce(new Error("smtp down"));
    expect(await sendEmailOtp("x@y.z")).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("still returns true (code stored) if both SMTP and Resend fail", async () => {
    smtpMock.mockRejectedValueOnce(new Error("smtp down"));
    sendMock.mockRejectedValueOnce(new Error("resend down"));
    expect(await sendEmailOtp("x@y.z")).toBe(true);
  });
});

describe("sendOnboardingOtp — resilient channels", () => {
  it("delivers via SMTP + WhatsApp and reports channels honestly", async () => {
    const { ok, channels } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(true);
    expect(channels).toEqual(["email", "whatsapp"]);
    expect(smtpMock).toHaveBeenCalledOnce();
    expect(sendMock).not.toHaveBeenCalled();
    expect(whatsappMock).toHaveBeenCalledOnce();
  });

  it("delivers the code over WhatsApp even when SMTP and RESEND are unavailable", async () => {
    smtpMock.mockRejectedValueOnce(new Error("smtp down"));
    delete process.env.RESEND_API_KEY;
    const { ok, channels } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(true);
    expect(channels).toEqual(["whatsapp"]);
    expect(whatsappMock).toHaveBeenCalledWith("2348001111111", expect.stringContaining("Chertt verification code"));
  });

  it("reports email as NOT sent when both SMTP and Resend fail", async () => {
    smtpMock.mockRejectedValueOnce(new Error("smtp down"));
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "The domain is not verified" } });
    const { ok, channels } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(true);
    expect(channels).toEqual(["whatsapp"]);
  });

  it("returns not-ok only when every channel fails", async () => {
    smtpMock.mockRejectedValueOnce(new Error("smtp down"));
    delete process.env.RESEND_API_KEY;
    whatsappMock.mockRejectedValueOnce(new Error("whatsapp down"));
    const { ok } = await sendOnboardingOtp("pastor@grace.org", "2348001111111");
    expect(ok).toBe(false);
  });
});
