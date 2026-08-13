// WS3 — record scam/safeguarding flags so the platform team sees them, and
// escalate to the church's leaders immediately. Never throws — flagging is
// best-effort and must never block the reply to a person in danger.

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { notifyLeaders } from "@/lib/services/church/referral";

export type FlagKind = "scam" | "safeguarding";

/** Open flags for the /admin panel, newest first, with resolved person names. */
export async function listFlaggedMessages(limit = 100): Promise<{ id: string; kind: FlagKind; reason: string; excerpt: string; fromPhone: string; personName: string; status: string; createdAt: string }[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data } = await db
    .from("flagged_messages")
    .select("id, from_phone, person_id, kind, reason, excerpt, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as any[];
  const personIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))];
  const people = personIds.length ? (((await db.from("people").select("id, full_name").in("id", personIds)).data ?? []) as any[]) : [];
  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    reason: r.reason ?? "",
    excerpt: r.excerpt ?? "",
    fromPhone: r.from_phone ?? "",
    personName: r.person_id ? nameById.get(r.person_id) ?? "Unknown" : "Unknown",
    status: r.status,
    createdAt: r.created_at,
  }));
}

/** Mark a flag reviewed. */
export async function markFlagReviewed(id: string, reviewer: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await db
    .from("flagged_messages")
    .update({ status: "reviewed", reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function flagMessage(params: {
  fromPhone: string;
  personId: string | null;
  workspaceId: string | null;
  kind: FlagKind;
  reason: string;
  excerpt: string;
}): Promise<void> {
  try {
    const db = getSupabaseServerClient();
    if (db) {
      await db.from("flagged_messages").insert({
        from_phone: params.fromPhone,
        person_id: params.personId,
        workspace_id: params.workspaceId,
        kind: params.kind,
        reason: params.reason,
        excerpt: params.excerpt.slice(0, 500),
        status: "open",
      });
    }
  } catch {
    // the flag row is best-effort; the reply path continues regardless
  }

  if (!params.workspaceId) return;
  try {
    if (params.kind === "safeguarding") {
      await notifyLeaders({
        workspaceId: params.workspaceId,
        roleAtLeast: "secretary",
        message: `🚨 URGENT — possible safeguarding disclosure from ${params.fromPhone}. A human (pastor/leader) must follow up immediately. Chertt has replied with care but does not counsel.`,
      });
    } else {
      await notifyLeaders({
        workspaceId: params.workspaceId,
        roleAtLeast: "secretary",
        message: `⚠️ Possible scam attempt from ${params.fromPhone} (${params.reason}). Chertt refused and warned them — flagging so you're aware.`,
      });
    }
  } catch {
    // leader notification is best-effort
  }
}
