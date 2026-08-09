import { resolveByToken, updateApplication, runKycChecks } from "@/lib/services/kyc/applications";
import { verifyEmailOtp } from "@/lib/services/kyc/email-otp";
import { uploadKycFile } from "@/lib/services/kyc/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ ok: false, error: "Bad form data." }, { status: 400 });
  const s = (k: string) => String(fd.get(k) ?? "").trim();

  const token = s("token");
  const app = token ? await resolveByToken(token) : null;
  if (!app) return Response.json({ ok: false, error: "This link is invalid or expired." }, { status: 404 });

  if (s("consent") !== "on") return Response.json({ ok: false, error: "Consent is required." }, { status: 400 });
  const email = s("email");
  if (!(await verifyEmailOtp(email, s("email_code")))) {
    return Response.json({ ok: false, error: "That email code is wrong or expired." }, { status: 400 });
  }

  const idType = s("id_type") === "bvn" ? "bvn" : "nin";
  const idNumber = s("id_number");

  // Store the selfie privately.
  const selfie = fd.get("selfie");
  let selfiePath: string | undefined;
  if (selfie instanceof File && selfie.size > 0) {
    selfiePath = `${app.id}/selfie-${Date.now()}.jpg`;
    await uploadKycFile(selfiePath, new Uint8Array(await selfie.arrayBuffer()), selfie.type || "image/jpeg");
  }

  await updateApplication(app.id, {
    church_legal_name: s("church_legal_name"),
    it_number: s("it_number"),
    address: s("address"),
    applicant_role: s("applicant_role"),
    id_type: idType,
    email,
    email_verified_at: new Date().toISOString(),
    selfie_path: selfiePath ?? null,
    consent_at: new Date().toISOString(),
  });

  await runKycChecks({ id: app.id, itNumber: s("it_number"), churchLegalName: s("church_legal_name"), idType, idNumber, applicantRole: s("applicant_role") });

  await updateApplication(app.id, { status: "pending" });
  return Response.json({ ok: true });
}
