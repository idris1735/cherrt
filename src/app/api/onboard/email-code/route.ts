import { resolveByToken } from "@/lib/services/kyc/applications";
import { sendOnboardingOtp } from "@/lib/services/kyc/email-otp";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const { token, email } = (await req.json().catch(() => ({}))) as { token?: string; email?: string };
  if (!token || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  const app = await resolveByToken(token);
  if (!app) return Response.json({ ok: false, error: "This link is invalid or has expired." }, { status: 404 });

  // P0-1: the code goes to BOTH email and the applicant's WhatsApp — a missing
  // RESEND_API_KEY can never block onboarding.
  const phone = typeof app.applicant_phone === "string" ? app.applicant_phone : null;
  const { ok, channels } = await sendOnboardingOtp(email, phone);
  return Response.json({ ok, channels });
}
