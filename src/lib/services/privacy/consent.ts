import { getSupabaseServerClient } from "@/lib/services/supabase-server";

// Versioned so a policy change is auditable. Bump when the notice/policy changes.
export const CONSENT_VERSION = "2026-08-13-v1";

export type ConsentSource =
  | "whatsapp_first_contact"
  | "onboarding_form"
  | "member_form"
  | "first_timer_capture"
  | "department_join"
  | "pastoral_form"
  | "prayer_request"
  | "guardian"
  | "leader_registered";

/** Record lawful basis on a person at/before write time. Idempotent-ish: later calls overwrite. */
export async function recordConsent(params: {
  personId: string;
  source: ConsentSource;
  guardianPersonId?: string;
  version?: string;
}): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;
  await db.from("people").update({
    consent_at: new Date().toISOString(),
    consent_version: params.version ?? CONSENT_VERSION,
    consent_source: params.source,
  }).eq("id", params.personId);
}

/** Is this phone number opted out of outbound messages? Unknown numbers: false. */
export async function isOptedOut(phone: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { data } = await db
    .from("phone_contacts")
    .select("opted_out")
    .eq("phone_number", phone)
    .eq("status", "active")
    .maybeSingle();
  return !!((data as { opted_out?: boolean } | null)?.opted_out);
}

export async function setOptedOut(phone: string): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;
  await db.from("phone_contacts").update({
    opted_out: true,
    opted_out_at: new Date().toISOString(),
  }).eq("phone_number", phone).eq("status", "active");
}

export async function clearOptOut(phone: string): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;
  await db.from("phone_contacts").update({
    opted_out: false,
    opted_out_at: null,
  }).eq("phone_number", phone).eq("status", "active");
}

export type DataRequestKind = "access" | "deletion" | "objection";

export async function logDataRequest(params: {
  kind: DataRequestKind;
  note?: string;
  personId?: string;
  workspaceId?: string;
}): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;
  await db.from("data_requests").insert({
    person_id: params.personId ?? null,
    workspace_id: params.workspaceId ?? null,
    kind: params.kind,
    status: "open",
    note: params.note ?? null,
  });
}
