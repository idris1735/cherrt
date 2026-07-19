import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/whatsapp", () => ({
  sendTemplateMessage: vi.fn().mockResolvedValue(undefined),
}));

import { sendTemplateMessage } from "@/lib/services/whatsapp";
import {
  sendNewSignupAlertTemplate,
  sendOrgApprovedTemplate,
  sendOrgRejectedTemplate,
} from "@/lib/services/whatsapp-templates";

const mockSend = sendTemplateMessage as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_TEMPLATE_NEW_SIGNUP;
  delete process.env.WHATSAPP_TEMPLATE_ORG_APPROVED;
  delete process.env.WHATSAPP_TEMPLATE_ORG_REJECTED;
});

describe("sendNewSignupAlertTemplate", () => {
  it("sends the new-signup template with params in order", async () => {
    await sendNewSignupAlertTemplate("2348011111111", {
      churchName: "Grace Chapel",
      adminName: "Ruth Adeyemi",
      adminPhone: "2348022222222",
      city: "Lagos",
      size: "300",
      code: "ab12cd34",
    });

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_new_signup_alert",
      "en",
      ["Grace Chapel", "Ruth Adeyemi", "2348022222222", "Lagos", "300", "ab12cd34"],
    );
  });

  it("uses the env var override for the template name when set", async () => {
    process.env.WHATSAPP_TEMPLATE_NEW_SIGNUP = "custom_signup_template";

    await sendNewSignupAlertTemplate("2348011111111", {
      churchName: "Grace Chapel",
      adminName: "Ruth Adeyemi",
      adminPhone: "2348022222222",
      city: "Lagos",
      size: "300",
      code: "ab12cd34",
    });

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "custom_signup_template",
      "en",
      expect.any(Array),
    );
  });
});

describe("sendOrgApprovedTemplate", () => {
  it("sends the org-approved template with admin name and workspace name", async () => {
    await sendOrgApprovedTemplate("2348011111111", "Ruth Adeyemi", "Grace Chapel — Lagos");

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_org_approved",
      "en",
      ["Ruth Adeyemi", "Grace Chapel — Lagos"],
    );
  });

  it("falls back to 'there' when admin name is empty", async () => {
    await sendOrgApprovedTemplate("2348011111111", "", "Grace Chapel — Lagos");

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_org_approved",
      "en",
      ["there", "Grace Chapel — Lagos"],
    );
  });
});

describe("sendOrgRejectedTemplate", () => {
  it("sends the org-rejected template with church name and reason", async () => {
    await sendOrgRejectedTemplate("2348011111111", "Grace Chapel", "budget exceeded");

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_org_rejected",
      "en",
      ["Grace Chapel", "budget exceeded"],
    );
  });
});
