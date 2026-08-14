import { createHash, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { verifyOtp } from "@/lib/services/identity/otp";
import { sendTextMessage } from "@/lib/services/whatsapp";

function hash(code: string): string {
  return createHash("sha256").update(code + (process.env.OTP_PEPPER ?? "chertt-otp")).digest("hex");
}

// ── Email delivery chain ──────────────────────────────────────────────────
// 1. SMTP (Hostinger etc.) — primary: works TODAY for verified mailbox domains
//    like chertt.com (SPF already authorizes the host's mail servers).
// 2. Resend — fallback for test mode / verified domains.
// 3. WhatsApp — the always-guaranteed channel (handled by callers).

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    user,
    pass,
    from: process.env.SMTP_FROM ?? `Chertt <${user}>`,
  };
}

async function sendViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const cfg = smtpConfig();
  if (!cfg) return false; // not configured — caller falls back to Resend
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    const info = await transport.sendMail({ from: cfg.from, to, subject, html });
    return Boolean(info.messageId);
  } catch (err) {
    console.error("[email-otp] SMTP send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    // NB: the Resend SDK RETURNS errors instead of throwing — a resolved
    // promise with `error` set means the email did NOT go out.
    const { error: sendErr } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM ?? "Chertt <onboarding@resend.dev>",
      to,
      subject,
      html,
    });
    if (sendErr) console.error("[email-otp] Resend rejected the send:", sendErr.message);
    return !sendErr;
  } catch (err) {
    console.error("[email-otp] Resend send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// Sends a 6-digit code to an email (SMTP first, Resend fallback), stored in
// otp_challenges with purpose 'email' (phone_number column holds the email).
// Delivery failure is non-fatal (a resend retries).
export async function sendEmailOtp(email: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("otp_challenges").delete().eq("phone_number", email).eq("purpose", "email");
  const { error } = await db.from("otp_challenges").insert({
    phone_number: email, purpose: "email", code_hash: hash(code),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) return false;
  const subject = "Your Chertt verification code";
  const html = `<p>Your Chertt code is <b>${code}</b>. It expires in 10 minutes. Never share it.</p>`;
  const sentSmtp = await sendViaSmtp(email, subject, html);
  if (!sentSmtp) await sendViaResend(email, subject, html);
  return true;
}

/**
 * Demo-resilient onboarding OTP. Stores the same code under purpose 'email',
 * delivers it via SMTP → Resend → WhatsApp (channels reported honestly), and
 * ALWAYS sends the code over WhatsApp to the applicant's phone. A missing
 * email provider can never block onboarding.
 */
export async function sendOnboardingOtp(email: string, phone: string | null): Promise<{ ok: boolean; channels: string[] }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false, channels: [] };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("otp_challenges").delete().eq("phone_number", email).eq("purpose", "email");
  const { error } = await db.from("otp_challenges").insert({
    phone_number: email, purpose: "email", code_hash: hash(code),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) return { ok: false, channels: [] };

  const channels: string[] = [];

  const subject = "Your Chertt verification code";
  const html = `<p>Your Chertt code is <b>${code}</b>. It expires in 10 minutes. Never share it.</p>`;
  const sentSmtp = await sendViaSmtp(email, subject, html);
  if (sentSmtp) {
    channels.push("email");
  } else if (await sendViaResend(email, subject, html)) {
    channels.push("email");
  }

  // WhatsApp channel — the demo's guaranteed delivery path
  if (phone) {
    try {
      await sendTextMessage(phone, `🔒 Your Chertt verification code is *${code}*. It expires in 10 minutes. Never share it.`);
      channels.push("whatsapp");
    } catch { /* caller reports the truth */ }
  }

  return { ok: channels.length > 0, channels };
}

export function verifyEmailOtp(email: string, code: string): Promise<boolean> {
  return verifyOtp(email, "email", code).then((r) => r.ok);
}
