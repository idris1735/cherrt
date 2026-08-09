import { createHash, randomInt } from "node:crypto";
import { Resend } from "resend";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { verifyOtp } from "@/lib/services/identity/otp";

function hash(code: string): string {
  return createHash("sha256").update(code + (process.env.OTP_PEPPER ?? "chertt-otp")).digest("hex");
}

// Sends a 6-digit code to an email (Resend), stored in otp_challenges with
// purpose 'email' (phone_number column holds the email). Mirrors sendOtp but
// over email instead of WhatsApp. Delivery failure is non-fatal (a resend retries).
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
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      await new Resend(apiKey).emails.send({
        from: process.env.RESEND_FROM ?? "Chertt <onboarding@resend.dev>",
        to: email,
        subject: "Your Chertt verification code",
        html: `<p>Your Chertt code is <b>${code}</b>. It expires in 10 minutes. Never share it.</p>`,
      });
    } catch { /* code is stored; caller can resend */ }
  }
  return true;
}

export function verifyEmailOtp(email: string, code: string): Promise<boolean> {
  return verifyOtp(email, "email", code).then((r) => r.ok);
}
