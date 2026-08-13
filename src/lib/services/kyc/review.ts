import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { signedKycUrl } from "@/lib/services/kyc/storage";
import { provisionPersonMembership } from "@/lib/services/identity/provisioning";
import { foundingAdminRole } from "@/lib/services/identity/role-catalog";
import { slugifyWorkspaceName } from "@/lib/services/onboarding-draft";
import { sendOrgApprovedTemplate, sendOrgRejectedTemplate } from "@/lib/services/whatsapp-templates";
import { startSetupFlow } from "@/lib/services/onboarding-flow";
import { recordConsent } from "@/lib/services/privacy/consent";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PendingRow = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; created_at: string };
export type ReviewDetail = Record<string, any> & { selfieUrl: string | null; idPhotoDataUrl: string | null; cacCertUrl: string | null };

export async function listPendingApplications(): Promise<PendingRow[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data } = await db
    .from("kyc_applications")
    .select("id, church_legal_name, applicant_phone, trustee_match, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data as PendingRow[]) ?? [];
}

/** Every application across all stages, with chip data — the KYC pipeline. */
export async function listAllApplications(): Promise<(PendingRow & { status: string; cac_result: unknown; id_result: unknown; reject_reason: string | null })[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data } = await db
    .from("kyc_applications")
    .select("id, church_legal_name, applicant_phone, trustee_match, status, cac_result, id_result, reject_reason, created_at")
    .order("created_at", { ascending: true });
  return (data as any[]) ?? [];
}

async function loadApp(db: any, id: string): Promise<any | null> {
  const { data } = await db.from("kyc_applications").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function getApplicationForReview(id: string): Promise<ReviewDetail | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const app = await loadApp(db, id);
  if (!app) return null;
  // P0-4: every signed URL is guarded — a missing file is null, never a crash
  let selfieUrl: string | null = null;
  let cacCertUrl: string | null = null;
  try {
    selfieUrl = app.selfie_path ? await signedKycUrl(app.selfie_path) : null;
  } catch {
    selfieUrl = null;
  }
  try {
    cacCertUrl = app.cac_cert_path ? await signedKycUrl(app.cac_cert_path) : null;
  } catch {
    cacCertUrl = null;
  }
  const photo = app.id_result?.photoBase64;
  const idPhotoDataUrl = photo ? `data:image/jpeg;base64,${photo}` : null;
  return { ...app, selfieUrl, idPhotoDataUrl, cacCertUrl };
}

// Approve: provision the church (org + workspace), seat the applicant as
// creator, mark approved, notify. Idempotent — acts only on a pending row.
export async function approveKycApplication(id: string, reviewerEmail: string): Promise<{ ok: boolean; workspaceSlug?: string; reason?: string }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false, reason: "no_db" };
  const app = await loadApp(db, id);
  if (!app) return { ok: false, reason: "not_found" };
  if (app.status !== "pending") return { ok: false, reason: "not_pending" };

  const name = app.church_legal_name || "New Church";
  const { data: org } = await db.from("organizations").insert({
    name, status: "active", requested_by_phone: app.applicant_phone,
    requested_by_name: app.applicant_role || name, requested_city: app.address || "Unspecified", requested_size: app.size || "unknown",
  }).select("id").single();

  let slug = slugifyWorkspaceName(name);
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await db.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${slugifyWorkspaceName(name)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const { data: ws, error: wsErr } = await db.from("workspaces").insert({
    slug, name, legal_name: name, city: app.address || "Unspecified", timezone: "Africa/Lagos", organization_id: org?.id,
  }).select("id, slug, name").single();
  if (wsErr || !ws) return { ok: false, reason: "workspace_failed" };

  const founderName = app.id_result?.firstname ? `${app.id_result.firstname} ${app.id_result.surname ?? ""}`.trim() : (app.applicant_role || name);
  const provisioned = await provisionPersonMembership({
    phoneNumber: app.applicant_phone, fullName: founderName, workspaceId: ws.id,
    workspaceSlug: ws.slug, workspaceName: ws.name, role: foundingAdminRole("church"), organizationId: org?.id,
  });
  // The applicant consented explicitly on the web form (consent_at stored on the
  // application) — mirror that lawful basis onto the newly created person.
  if (provisioned?.personId) {
    recordConsent({ personId: provisioned.personId, source: "onboarding_form" }).catch(() => {});
  }

  await db.from("kyc_applications").update({
    status: "approved", workspace_id: ws.id, reviewed_by: reviewerEmail, reviewed_at: new Date().toISOString(),
  }).eq("id", id);

  // Resume onboarding in WhatsApp: seed the post-approval setup so the creator's
  // next message continues configuring giving categories, ministries, branches.
  try { if (org?.id) await startSetupFlow(app.applicant_phone, org.id, ws.id); } catch { /* best-effort */ }

  try { await sendOrgApprovedTemplate(app.applicant_phone, founderName, ws.name); } catch { /* notify is best-effort */ }
  return { ok: true, workspaceSlug: ws.slug };
}

export async function rejectKycApplication(id: string, reviewerEmail: string, reason: string): Promise<{ ok: boolean }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false };
  const app = await loadApp(db, id);
  if (!app || app.status !== "pending") return { ok: false };
  await db.from("kyc_applications").update({
    status: "rejected", reject_reason: reason, reviewed_by: reviewerEmail, reviewed_at: new Date().toISOString(),
  }).eq("id", id);
  try { await sendOrgRejectedTemplate(app.applicant_phone, app.church_legal_name || "your church", reason); } catch { /* best-effort */ }
  return { ok: true };
}
