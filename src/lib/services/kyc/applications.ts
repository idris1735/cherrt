import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { monoCacLookup, monoCacTrustees, monoNinLookup } from "@/lib/services/kyc/mono";
import { matchTrustee } from "@/lib/services/kyc/trustee-match";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type KycApplication = { id: string; status: string; token: string; applicantPhone: string; [k: string]: unknown };
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function startApplication(phone: string): Promise<{ token: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const token = randomBytes(24).toString("base64url");
  const { error } = await db.from("kyc_applications").insert({
    token, token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    applicant_phone: phone, status: "draft",
  }).select("id").single();
  return error ? null : { token };
}

export async function resolveByToken(token: string): Promise<KycApplication | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await db
    .from("kyc_applications")
    .select("*")
    .eq("token", token)
    .eq("status", "draft")
    .gt("token_expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  const r = data as any;
  return { ...r, applicantPhone: r.applicant_phone };
}

export async function updateApplication(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await db.from("kyc_applications").update(patch).eq("id", id);
  return !error;
}

// Runs the automated checks (CAC + trustee match + ID lookup) and records the
// results onto the application. Returns a summary; nothing auto-approves — a
// human reviewer decides with these results visible.
// P0-3: every check is individually guarded — Mono being down, rate-limited,
// or throwing can never reject this call. Errors are recorded on the row so
// the reviewer sees "errored" and verifies manually.
export async function runKycChecks(app: {
  id: string; itNumber: string; churchLegalName: string; idType: "nin" | "bvn"; idNumber: string; applicantRole?: string;
}): Promise<{ cac: boolean; id: boolean; trustee: "match" | "no_match" | "unknown" }> {
  const patch: Record<string, unknown> = { id_last4: app.idNumber.slice(-4) };

  // CAC lookup — guarded
  let company: { rcNumber?: string; id: string; active?: boolean } | undefined;
  try {
    const cacRes = await monoCacLookup(app.itNumber || app.churchLegalName);
    company = cacRes.ok
      ? cacRes.data.find((c) => c.rcNumber && app.itNumber && c.rcNumber.replace(/\W/g, "") === app.itNumber.replace(/\W/g, "")) ?? cacRes.data[0]
      : undefined;
    patch.cac_result = cacRes.ok ? { company, count: cacRes.data.length } : { error: cacRes.error };
  } catch {
    patch.cac_result = { error: "CAC lookup failed — verify manually" };
  }

  // Trustee match — guarded
  let trustee: "match" | "no_match" | "unknown" = "unknown";
  try {
    if (company) {
      const tRes = await monoCacTrustees(company.id);
      trustee = tRes.ok ? matchTrustee(app.applicantRole ?? "", tRes.data) : "unknown";
    }
  } catch {
    trustee = "unknown";
  }
  patch.trustee_match = trustee;

  // ID lookup — guarded
  let idOk = false;
  try {
    const idRes = app.idType === "nin" ? await monoNinLookup(app.idNumber) : { ok: false as const, error: "BVN not yet wired" };
    idOk = idRes.ok;
    patch.id_result = idRes.ok ? idRes.data : { error: idRes.error };
  } catch {
    patch.id_result = { error: "ID lookup failed — verify manually" };
  }

  await updateApplication(app.id, patch);
  return { cac: !!company && !!company.active, id: idOk, trustee };
}
