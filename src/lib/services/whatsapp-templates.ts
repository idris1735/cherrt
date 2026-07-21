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

// ── Announcement broadcast template (ACTIVATE when a template is approved) ──
// WhatsApp forbids free-form business-initiated messages to members outside the
// 24h session window — those need a pre-approved template. Once you create and
// get Meta approval for an announcement template (e.g. "chertt_announcement"
// with two body params — {{1}} title, {{2}} body), set the env var
// WHATSAPP_TEMPLATE_ANNOUNCEMENT and uncomment this. Then switch the fan-out in
// agent/announcement-tools.ts to call it (see the commented block there).
//
// export async function sendAnnouncementTemplate(to: string, title: string, body: string): Promise<void> {
//   await sendTemplateMessage(
//     to,
//     templateName("WHATSAPP_TEMPLATE_ANNOUNCEMENT", "chertt_announcement"),
//     LANGUAGE_CODE,
//     [title, body],
//   );
// }
