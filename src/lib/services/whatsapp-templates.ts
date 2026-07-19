import { sendTemplateMessage } from "@/lib/services/whatsapp";

const LANGUAGE_CODE = "en";

function templateName(envVar: string, fallback: string): string {
  return process.env[envVar] ?? fallback;
}

export async function sendNewSignupAlertTemplate(
  to: string,
  fields: { churchName: string; adminName: string; adminPhone: string; city: string; size: string; code: string },
): Promise<void> {
  await sendTemplateMessage(
    to,
    templateName("WHATSAPP_TEMPLATE_NEW_SIGNUP", "chertt_new_signup_alert"),
    LANGUAGE_CODE,
    [fields.churchName, fields.adminName, fields.adminPhone, fields.city, fields.size, fields.code],
  );
}

export async function sendOrgApprovedTemplate(to: string, adminName: string, workspaceName: string): Promise<void> {
  await sendTemplateMessage(
    to,
    templateName("WHATSAPP_TEMPLATE_ORG_APPROVED", "chertt_org_approved"),
    LANGUAGE_CODE,
    [adminName || "there", workspaceName],
  );
}

export async function sendOrgRejectedTemplate(to: string, churchName: string, reason: string): Promise<void> {
  await sendTemplateMessage(
    to,
    templateName("WHATSAPP_TEMPLATE_ORG_REJECTED", "chertt_org_rejected"),
    LANGUAGE_CODE,
    [churchName, reason],
  );
}
