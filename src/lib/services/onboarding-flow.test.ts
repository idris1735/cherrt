import { describe, it, expect, vi, beforeEach } from "vitest";

const { startAppMock, updateSessionMock } = vi.hoisted(() => ({
  startAppMock: vi.fn(),
  updateSessionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/kyc/applications", () => ({ startApplication: startAppMock }));
vi.mock("@/lib/services/whatsapp-session", () => ({ updateSession: updateSessionMock }));
// Keep the heavy workspace/template deps quiet — this test only exercises startSignupFlow.
vi.mock("@/lib/services/whatsapp-workspace", () => ({
  createPendingOrganization: vi.fn(), platformAdminPhones: () => [], createBranch: vi.fn(),
  saveGivingCategories: vi.fn(), saveMinistryUnits: vi.fn(), codeFromWorkspaceId: () => "CODE",
}));
vi.mock("@/lib/services/whatsapp-templates", () => ({ sendNewSignupAlertTemplate: vi.fn() }));

import { startSignupFlow } from "@/lib/services/onboarding-flow";

beforeEach(() => { vi.clearAllMocks(); process.env.NEXT_PUBLIC_APP_URL = "https://chertt.test"; });

describe("startSignupFlow (web KYC)", () => {
  it("issues a KYC token and returns the onboard URL for a tappable button", async () => {
    startAppMock.mockResolvedValue({ token: "tok123" });
    const reply = await startSignupFlow("2348001112222");
    expect(startAppMock).toHaveBeenCalledWith("2348001112222");
    expect(reply.url).toBe("https://chertt.test/onboard/tok123");
    expect(reply.text).toMatch(/verify/i);
    expect(reply.text).not.toContain("https://"); // the URL rides in the button, not the body
    expect(updateSessionMock).not.toHaveBeenCalledWith("2348001112222", expect.objectContaining({ onboarding: expect.objectContaining({ flow: "new-church-signup" }) }));
  });
  it("degrades gracefully if a token can't be created", async () => {
    startAppMock.mockResolvedValue(null);
    const reply = await startSignupFlow("2348001112222");
    expect(reply.text).toMatch(/try again/i);
    expect(reply.url).toBeNull();
  });
});
