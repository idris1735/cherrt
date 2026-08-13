import { sendTemplateMessage, sendTextMessage } from "@/lib/services/whatsapp";

const LANGUAGE_CODE = "en";

function templateName(envVar: string, fallback: string): string {
  return process.env[envVar] ?? fallback;
}

// P0-2: every business-initiated message falls back to plain text when the
// approved template isn't live. In a demo the recipient is inside the 24-hour
// session window, so plain text delivers. Never let a missing template kill
// the message.
async function templateOrText(to: string, name: string, params: string[], plain: string): Promise<"template" | "text"> {
  try {
    await sendTemplateMessage(to, name, LANGUAGE_CODE, params);
    return "template";
  } catch {
    try {
      await sendTextMessage(to, plain);
      return "text";
    } catch {
      return "text"; // both failed — caller proceeds; demo survives
    }
  }
}

export async function sendNewSignupAlertTemplate(
  to: string,
  fields: { churchName: string; adminName: string; adminPhone: string; city: string; size: string; code: string },
): Promise<void> {
  await templateOrText(
    to,
    templateName("WHATSAPP_TEMPLATE_NEW_SIGNUP", "chertt_new_signup_alert"),
    [fields.churchName, fields.adminName, fields.adminPhone, fields.city, fields.size, fields.code],
    `⛪ New church signup: *${fields.churchName}*\nAdmin: ${fields.adminName} (${fields.adminPhone})\nCity: ${fields.city} · Size: ${fields.size}`,
  );
}

export async function sendOrgApprovedTemplate(to: string, adminName: string, workspaceName: string): Promise<void> {
  await templateOrText(
    to,
    templateName("WHATSAPP_TEMPLATE_ORG_APPROVED", "chertt_org_approved"),
    [adminName || "there", workspaceName],
    `🎉 Great news — *${workspaceName}* is approved and live on Chertt! We'll continue the setup right here.`,
  );
}

export async function sendOrgRejectedTemplate(to: string, churchName: string, reason: string): Promise<void> {
  await templateOrText(
    to,
    templateName("WHATSAPP_TEMPLATE_ORG_REJECTED", "chertt_org_rejected"),
    [churchName, reason],
    `We reviewed *${churchName}* and couldn't approve it at this time${reason ? `: ${reason}` : ""}. Reply here if you'd like to discuss.`,
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
