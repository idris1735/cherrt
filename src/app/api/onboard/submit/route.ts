import { resolveByToken, updateApplication, runKycChecks, isUsernameTaken } from "@/lib/services/kyc/applications";
import { verifyEmailOtp } from "@/lib/services/kyc/email-otp";
import { uploadKycFile } from "@/lib/services/kyc/storage";
import { sendTextMessage } from "@/lib/services/whatsapp";
import { isValidId, isValidEmail, isValidPhone, isValidFullName, isValidUsername, isValidWebsite, isValidCountry, isValidNigeriaState, isValidNigeriaCity, normalizePhone, MAX_FILE_BYTES } from "@/lib/onboard-validation";

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
  const username = s("username");
  const website = s("website");
  const country = s("country") || "NG";
  const state = s("state");
  const cityRaw = s("city");
  // "Other" lets a church in an unlisted town type it manually.
  const city = cityRaw === "Other" ? s("city_other") : cityRaw;
  const fullNameRaw = s("full_name");
  const positionRaw = s("position");
  // Google Maps coordinates from the address pick — null unless provided.
  const coord = (k: string): number | null => {
    const raw = s(k);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const addressLat = coord("address_lat");
  const addressLng = coord("address_lng");
  if (addressLat !== null && (addressLat < -90 || addressLat > 90)) return Response.json({ ok: false, error: "Bad coordinates." }, { status: 400 });
  if (addressLng !== null && (addressLng < -180 || addressLng > 180)) return Response.json({ ok: false, error: "Bad coordinates." }, { status: 400 });
  const fields: Record<string, string> = {};
  if (idNumber && !isValidId(idType, idNumber)) fields.id_number = `${idType.toUpperCase()} must be exactly 11 digits.`;
  if (email && !isValidEmail(email)) fields.email = "Enter a valid email address.";
  if (churchPhone && !isValidPhone(churchPhone)) fields.church_phone = "Enter a valid Nigerian WhatsApp number.";
  if (!country || !isValidCountry(country)) fields.country = "Pick a country from the list.";
  else if (country !== "NG") fields.country = "Chertt currently serves Nigerian churches.";
  if (country === "NG") {
    if (!state) fields.state = "Select your state.";
    else if (!isValidNigeriaState(state)) fields.state = "Pick a state from the list.";
    if (!city) fields.city = "Select your city.";
    else if (cityRaw !== "Other" && !isValidNigeriaCity(state, city)) fields.city = "Pick a city from the list.";
  }
  if (!s("address")) fields.address = "Enter the street address.";
  if (username && !isValidUsername(username)) fields.username = "Usernames are 3–20 lowercase letters, numbers or underscores (e.g. daystarcc).";
  if (website && !isValidWebsite(website)) fields.website = "That doesn't look like a website (e.g. gracechapel.org).";
  if (fullNameRaw && !isValidFullName(fullNameRaw)) fields.full_name = "Enter your first and last name, as on your ID.";
  if (positionRaw === "Other" && !s("position_other")) fields.position = "Tell us your position.";
  if (Object.keys(fields).length) return Response.json({ ok: false, error: "Please fix the highlighted fields.", fields }, { status: 400 });

  // P2-2: usernames are global — reject duplicates before any OTP round trip.
  const usernameLower = username ? username.toLowerCase() : null;
  if (usernameLower && (await isUsernameTaken(usernameLower))) {
    return Response.json({ ok: false, error: "That username is already taken — please pick another.", fields: { username: "Already taken." } }, { status: 400 });
  }

  if (!(await verifyEmailOtp(email, s("email_code")))) {
    return Response.json({ ok: false, error: "That email code is wrong or expired.", fields: { email_code: "Wrong or expired code." } }, { status: 400 });
  }

  // Structured name: full name is the trustee-match input (stronger anti-hijack
  // than a crammed "name, role" string). Fall back to the legacy single field.
  const fullName = fullNameRaw || s("applicant_role");
  const position = positionRaw === "Other" ? (s("position_other") || "Other") : positionRaw;
  const applicantRole = fullName ? `${fullName}${position ? `, ${position}` : ""}` : s("applicant_role");

  const store = async (field: File | null, prefix: string) => {
    if (!(field instanceof File) || field.size === 0) return null;
    if (field.size > MAX_FILE_BYTES) return null; // client already guards; skip oversized rather than fail the whole submit
    const ext = field.type === "application/pdf" ? "pdf" : "jpg";
    const path = `${app.id}/${prefix}-${Date.now()}.${ext}`;
    try {
      await uploadKycFile(path, new Uint8Array(await field.arrayBuffer()), field.type || "image/jpeg");
      return path;
    } catch (err) {
      // P0-3: a failed upload must never sink the whole submission — queue without it.
      console.error(`[onboard/submit] ${prefix} upload failed — continuing:`, err);
      return null;
    }
  };
  const selfiePath = await store(fd.get("selfie") as File | null, "selfie");
  const cacCertPath = await store(fd.get("cac_cert") as File | null, "cac");

  await updateApplication(app.id, {
    church_legal_name: s("church_legal_name"),
    it_number: s("it_number"),
    address: s("address"),
    city: city || null,
    state: country === "NG" ? state || null : null,
    country,
    address_lat: addressLat,
    address_lng: addressLng,
    denomination: s("denomination") || null,
    church_phone: churchPhone ? normalizePhone(churchPhone) : null,
    // P2-2 / P2-3: optional identifiers captured over time.
    username: usernameLower,
    website: website || null,
    // P1-1: flag (don't block) when the church's WhatsApp line differs from
    // the applicant's own number — a yellow case for the reviewer.
    church_phone_mismatch: churchPhone ? normalizePhone(churchPhone) !== (app.applicantPhone ?? "") : false,
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

  // Number legitimacy ping: the application thanks the church on WhatsApp.
  // A fake/offline number fails here, and the failure is recorded in
  // whatsapp_send_logs (with the statuses webhook confirming delivery).
  if (churchPhone) {
    try {
      await sendTextMessage(
        normalizePhone(churchPhone),
        "✅ Chertt received your church's application. Our team verifies it — usually within a day — and will message this number.",
      );
    } catch {
      console.warn("[onboard/submit] church phone unreachable on WhatsApp — logged for review:", churchPhone);
    }
  }

  return Response.json({ ok: true });
}
