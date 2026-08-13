import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseUserClient: (t: string) => (t ? { auth: { getUser: getUserMock } } : null),
}));

import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";

beforeEach(() => { getUserMock.mockReset(); process.env.PLATFORM_ADMIN_EMAILS = "boss@chertt.com, ops@chertt.com"; });

describe("platformAdminEmail", () => {
  it("returns the email for an allow-listed user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "Ops@Chertt.com" } }, error: null });
    expect(await platformAdminEmail("tok")).toBe("ops@chertt.com");
  });
  it("admits the built-in no-reply admin even when not in the env list", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    getUserMock.mockResolvedValue({ data: { user: { email: "donotreply@chertt.com" } }, error: null });
    expect(await platformAdminEmail("tok")).toBe("donotreply@chertt.com");
  });
  it("admits the built-in no-reply admin case-insensitively", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    getUserMock.mockResolvedValue({ data: { user: { email: "DoNotReply@Chertt.com" } }, error: null });
    expect(await platformAdminEmail("tok")).toBe("donotreply@chertt.com");
  });
  it("returns null for a non-allow-listed user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "random@x.com" } }, error: null });
    expect(await platformAdminEmail("tok")).toBeNull();
  });
  it("returns null with no token", async () => {
    expect(await platformAdminEmail(null)).toBeNull();
  });
  it("returns null when the token doesn't resolve to a user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await platformAdminEmail("tok")).toBeNull();
  });
});
