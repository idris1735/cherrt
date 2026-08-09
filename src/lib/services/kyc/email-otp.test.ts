import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMock, store } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }),
  store: { rows: [] as any[] },
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

import { sendEmailOtp } from "@/lib/services/kyc/email-otp";

beforeEach(() => { store.rows.length = 0; sendMock.mockClear(); process.env.RESEND_API_KEY = "re_test"; });

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
