// Children's check-in state transitions beyond the initial check-in:
// teacher-acceptance (checked_in → in_class). Workspace-scoped via service role.
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type PendingArrival = { id: string; childName: string; classroom: string | null };

// Children who are checked_in but a classroom teacher hasn't accepted yet.
export async function listPendingArrivals(workspaceId: string): Promise<PendingArrival[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data } = await db
    .from("child_checkins")
    .select("id, child_name, classroom_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "checked_in")
    .order("checked_in_at", { ascending: true })
    .limit(50);
  const rows = (data ?? []) as Array<{ id: string; child_name: string; classroom_id: string | null }>;
  if (!rows.length) return [];

  const roomIds = [...new Set(rows.map((r) => r.classroom_id).filter(Boolean) as string[])];
  const nameById = new Map<string, string>();
  if (roomIds.length) {
    const { data: rooms } = await db.from("classrooms").select("id, name").in("id", roomIds);
    for (const r of (rooms ?? []) as Array<{ id: string; name: string }>) nameById.set(r.id, r.name);
  }
  return rows.map((r) => ({ id: r.id, childName: r.child_name, classroom: r.classroom_id ? nameById.get(r.classroom_id) ?? null : null }));
}

// Teacher marks a checked-in child as arrived in class. Only transitions from
// checked_in (idempotent-safe: a second call on a non-checked_in row is a no-op).
export async function acceptArrival(workspaceId: string, checkinId: string, acceptedBy: string): Promise<{ ok: boolean; childName?: string }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false };
  const { data } = await db
    .from("child_checkins")
    .update({ status: "in_class", accepted_by: acceptedBy || "", accepted_at: new Date().toISOString() })
    .eq("id", checkinId)
    .eq("workspace_id", workspaceId)
    .eq("status", "checked_in")
    .select("child_name")
    .maybeSingle();
  if (!data) return { ok: false };
  return { ok: true, childName: (data as { child_name?: string }).child_name };
}
