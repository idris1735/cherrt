import { resolveByToken, updateApplication, runKycChecks } from "@/lib/services/kyc/applications";
import { verifyEmailOtp } from "@/lib/services/kyc/email-otp";
import { uploadKycFile } from "@/lib/services/kyc/storage";
import { isValidId, isValidEmail, isValidPhone, normalizePhone, MAX_FILE_BYTES } from "@/lib/onboard-validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ ok: false, error: "Bad form data." }, { status: 400 });
  const s = (k: string) => String(fd.get(k) ?? "").trim();

  const token = s("token");
  const app = token ? await resolveByToken(token) : null;
  if (!app) return Response.json({ ok: false, error: "This link is invalid or expired." }, { status: 404 });

  if (s("consent") !== "on") return Response.json({ ok: false, error: "Consent is required." }, { status: 400 });

  // Server-side re-validation (never trust the client). Only checks values that
  // are present, so it stays compatible while rejecting malformed input.
  const idType = s("id_type") === "bvn" ? "bvn" : "nin";
  const idNumber = s("id_number");
  const email = s("email");
  const churchPhone = s("church_phone");
  const fields: Record<string, string> = {};
  if (idNumber && !isValidId(idType, idNumber)) fields.id_number = `${idType.toUpperCase()} must be 11 digits.`;
  if (email && !isValidEmail(email)) fields.email = "Enter a valid email address.";
  if (churchPhone && !isValidPhone(churchPhone)) fields.church_phone = "Enter a valid Nigerian phone number.";
  if (Object.keys(fields).length) return Response.json({ ok: false, error: "Please fix the highlighted fields.", fields }, { status: 400 });

  if (!(await verifyEmailOtp(email, s("email_code")))) {
    return Response.json({ ok: false, error: "That email code is wrong or expired.", fields: { email_code: "Wrong or expired code." } }, { status: 400 });
  }

  // Structured name: full name is the trustee-match input (stronger anti-hijack
  // than a crammed "name, role" string). Fall back to the legacy single field.
  const fullName = s("full_name") || s("applicant_role");
  const position = s("position");
  const applicantRole = fullName ? `${fullName}${position ? `, ${position}` : ""}` : s("applicant_role");

  const store = async (field: File | null, prefix: string) => {
    if (!(field instanceof File) || field.size === 0) return null;
    if (field.size > MAX_FILE_BYTES) return null; // client already guards; skip oversized rather than fail the whole submit
    const ext = field.type === "application/pdf" ? "pdf" : "jpg";
    const path = `${app.id}/${prefix}-${Date.now()}.${ext}`;
    await uploadKycFile(path, new Uint8Array(await field.arrayBuffer()), field.type || "image/jpeg");
    return path;
  };
  const selfiePath = await store(fd.get("selfie") as File | null, "selfie");
  const cacCertPath = await store(fd.get("cac_cert") as File | null, "cac");

  await updateApplication(app.id, {
    church_legal_name: s("church_legal_name"),
    it_number: s("it_number"),
    address: s("address"),
    denomination: s("denomination") || null,
    church_phone: churchPhone ? normalizePhone(churchPhone) : null,
    applicant_role: applicantRole,
    applicant_full_name: fullName || null,
    applicant_position: position || null,
    id_type: idType,
    email,
    email_verified_at: new Date().toISOString(),
    selfie_path: selfiePath,
    cac_cert_path: cacCertPath,
    consent_at: new Date().toISOString(),
  });

  // P0-3: the automated checks can NEVER hard-fail the submission. Mono down,
  // rate-limited, or throwing — the application still lands in `pending` with
  // whatever results were recorded, and the reviewer verifies manually.
  try {
    await runKycChecks({ id: app.id, itNumber: s("it_number"), churchLegalName: s("church_legal_name"), idType, idNumber, applicantRole: fullName });
  } catch (err) {
    console.error("[onboard/submit] KYC checks failed — queuing for manual review:", err);
    await updateApplication(app.id, {
      cac_result: { error: "auto-checks incomplete — verify manually" },
      id_result: { error: "auto-checks incomplete — verify manually" },
      trustee_match: "unknown",
    }).catch(() => {});
  }

  // Always reach pending — never 500 on a real submission
  await updateApplication(app.id, { status: "pending" });
  return Response.json({ ok: true });
}
