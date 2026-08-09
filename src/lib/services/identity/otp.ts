import { createHash, randomInt } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { sendTextMessage } from "@/lib/services/whatsapp";

type Purpose = "migrate" | "step_up" | "email";
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function hash(code: string): string {
  return createHash("sha256").update(code + (process.env.OTP_PEPPER ?? "chertt-otp")).digest("hex");
}

// Generates a 6-digit code, stores its hash, and sends the code over WhatsApp.
// One active challenge per (phone, purpose): a resend replaces the previous.
export async function sendOtp(phone: string, purpose: Purpose): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("otp_challenges").delete().eq("phone_number", phone).eq("purpose", purpose);
  const { error } = await db.from("otp_challenges").insert({
    phone_number: phone, purpose, code_hash: hash(code), expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  });
  if (error) return false;
  try {
    await sendTextMessage(phone, `Your Chertt code is *${code}*. It expires in 10 minutes. Never share it.`);
  } catch { /* code is stored; a resend can retry delivery */ }
  return true;
}

export async function verifyOtp(
  phone: string,
  purpose: Purpose,
  code: string,
): Promise<{ ok: boolean; reason?: "expired" | "wrong" | "too_many" | "none" }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false, reason: "none" };
  const now = new Date().toISOString();

  // Atomic consume: a single conditional UPDATE stamps consumed_at ONLY on the
  // row that is the correct code, unconsumed, unexpired, and under the attempt
  // cap. Concurrent duplicate verifications can't both win (the second sees
  // consumed_at already set), so a code is single-use — no replay, no TOCTOU.
  const { data: consumed } = await db
    .from("otp_challenges")
    .update({ consumed_at: now })
    .eq("phone_number", phone)
    .eq("purpose", purpose)
    .eq("code_hash", hash(code))
    .is("consumed_at", null)
    .gt("expires_at", now)
    .lt("attempts", MAX_ATTEMPTS)
    .select("id");
  if (consumed && (consumed as unknown[]).length > 0) return { ok: true };

  // Didn't consume — classify why against the live challenge, and count a wrong
  // attempt toward the cap.
  const { data } = await db
    .from("otp_challenges")
    .select("id, expires_at, attempts")
    .eq("phone_number", phone)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; expires_at: string; attempts: number } | null;
  if (!row) return { ok: false, reason: "none" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  await db.from("otp_challenges").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  return { ok: false, reason: "wrong" };
}
