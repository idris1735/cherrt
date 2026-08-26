import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, verifyOtpMock, sendEmailOtpMock } = vi.hoisted(() => ({
  store: {
    single: {} as Record<string, unknown | null>,
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
    dbNull: false,
  },
  verifyOtpMock: vi.fn(),
  sendEmailOtpMock: vi.fn(),
}));

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => {
    if (store.dbNull) return null;
    return {
      from(table: string) {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          update: (patch: Record<string, unknown>) => {
            store.updates.push({ table, patch });
            return chain;
          },
          maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
          then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
        };
        return chain;
      },
    };
  },
}));
vi.mock("@/lib/services/kyc/email-otp", () => ({
  sendEmailOtp: sendEmailOtpMock,
  verifyEmailOtp: verifyOtpMock,
}));
vi.mock("@/lib/services/phone", () => ({ normalizePhoneNumber: (p: string) => p }));

import { confirmMemberEmail, startMemberEmailVerification } from "@/lib/services/identity/email-verify";

beforeEach(() => {
  vi.clearAllMocks();
  store.single = {};
  store.updates.length = 0;
  store.dbNull = false;
  verifyOtpMock.mockResolvedValue(true);
  sendEmailOtpMock.mockResolvedValue(true);
});

describe("confirmMemberEmail", () => {
  it("verifies the code against the stored email and stamps people.email_verified_at", async () => {
    store.single["phone_contacts"] = { person_id: "p1" };
    store.single["people"] = { email: "ada@example.com" };
    const res = await confirmMemberEmail("2348012345678", "123456");
    expect(verifyOtpMock).toHaveBeenCalledWith("ada@example.com", "123456");
    expect(res).toEqual({ status: "verified", email: "ada@example.com" });
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0].table).toBe("people");
    expect(store.updates[0].patch).toHaveProperty("email_verified_at");
  });

  it("returns no_email when the person has no email on file — no stamp", async () => {
    store.single["phone_contacts"] = { person_id: "p1" };
    store.single["people"] = { email: null };
    expect(await confirmMemberEmail("2348012345678", "123456")).toEqual({ status: "no_email" });
    expect(store.updates).toEqual([]);
  });

  it("returns bad_code when the OTP doesn't match — no stamp", async () => {
    store.single["phone_contacts"] = { person_id: "p1" };
    store.single["people"] = { email: "ada@example.com" };
    verifyOtpMock.mockResolvedValue(false);
    expect(await confirmMemberEmail("2348012345678", "999999")).toEqual({ status: "bad_code", email: "ada@example.com" });
    expect(store.updates).toEqual([]);
  });

  it("returns no_email when the phone maps to no person", async () => {
    store.single["phone_contacts"] = null;
    expect(await confirmMemberEmail("2348012345678", "123456")).toEqual({ status: "no_email" });
  });
});

describe("startMemberEmailVerification", () => {
  it("fires sendEmailOtp for a real email", async () => {
    await startMemberEmailVerification("ada@example.com");
    expect(sendEmailOtpMock).toHaveBeenCalledWith("ada@example.com");
  });

  it("no-ops on an empty email", async () => {
    await startMemberEmailVerification("");
    expect(sendEmailOtpMock).not.toHaveBeenCalled();
  });
});
