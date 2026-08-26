// Member email verification — async & non-blocking, WhatsApp-native.
//
// The connect rail captures an email but never waits on verifying it (the phone
// is already the verified identity anchor). After connecting we fire a code to
// the email, and the member confirms it whenever they like by replying
// "verify <code>" in the chat. Reuses the KYC email-OTP channel wholesale
// (SMTP → Resend, otp_challenges) and stamps people.email_verified_at.
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { normalizePhoneNumber } from "@/lib/services/phone";
import { sendEmailOtp, verifyEmailOtp } from "@/lib/services/kyc/email-otp";

// Fire-and-forget: email a verification code to a member. Best-effort — a
// missing provider or a transient failure never blocks or breaks the connect.
export async function startMemberEmailVerification(email: string): Promise<void> {
  if (!email) return;
  try {
    await sendEmailOtp(email);
  } catch (err) {
    console.error("[email-verify] send failed:", err instanceof Error ? err.message : err);
  }
}

export type EmailConfirmResult = { status: "verified" | "no_email" | "bad_code"; email?: string };

// Confirm a member's email from a "verify <code>" reply: resolve the person
// behind the phone, check the code against their stored email, and stamp
// people.email_verified_at. Idempotent — re-verifying an already-verified email
// just re-stamps and reports success.
export async function confirmMemberEmail(phoneRaw: string, code: string): Promise<EmailConfirmResult> {
  const db = getSupabaseServerClient();
  if (!db) return { status: "bad_code" };
  const phone = normalizePhoneNumber(phoneRaw) ?? phoneRaw;

  const { data: contact } = await db
    .from("phone_contacts")
    .select("person_id")
    .eq("phone_number", phone)
    .eq("status", "active")
    .maybeSingle();
  const personId = (contact as { person_id?: string } | null)?.person_id;
  if (!personId) return { status: "no_email" };

  const { data: person } = await db
    .from("people")
    .select("email")
    .eq("id", personId)
    .maybeSingle();
  const email = (person as { email?: string } | null)?.email;
  if (!email) return { status: "no_email" };

  const ok = await verifyEmailOtp(email, code);
  if (!ok) return { status: "bad_code", email };

  await db.from("people").update({ email_verified_at: new Date().toISOString() }).eq("id", personId);
  return { status: "verified", email };
}
