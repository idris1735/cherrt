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

export type HeldSeat = { id: string; childName: string; classroom: string | null; pickupCode: string };

// Reserve a seat ahead of time (status held). Occupies capacity so a room can't
// be over-booked. The pickup code is reserved now and issued on arrival.
export async function holdSeat(opts: { workspaceId: string; childName: string; classroomId?: string | null; guardianPersonId?: string | null; guardianName?: string; pickupCode: string }): Promise<{ id: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data, error } = await db
    .from("child_checkins")
    .insert({
      workspace_id: opts.workspaceId,
      child_name: opts.childName,
      classroom_id: opts.classroomId ?? null,
      guardian_person_id: opts.guardianPersonId ?? null,
      guardian_name: opts.guardianName ?? "",
      pickup_code: opts.pickupCode,
      status: "held",
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: (data as { id: string }).id };
}

// A guardian's still-held (not yet arrived) reservations.
export async function listHeldForGuardian(workspaceId: string, guardianPersonId: string): Promise<HeldSeat[]> {
  const db = getSupabaseServerClient();
  if (!db || !guardianPersonId) return [];
  const { data } = await db
    .from("child_checkins")
    .select("id, child_name, classroom_id, pickup_code")
    .eq("workspace_id", workspaceId)
    .eq("guardian_person_id", guardianPersonId)
    .eq("status", "held")
    .limit(20);
  const rows = (data ?? []) as Array<{ id: string; child_name: string; classroom_id: string | null; pickup_code: string }>;
  if (!rows.length) return [];
  const roomIds = [...new Set(rows.map((r) => r.classroom_id).filter(Boolean) as string[])];
  const nameById = new Map<string, string>();
  if (roomIds.length) {
    const { data: rooms } = await db.from("classrooms").select("id, name").in("id", roomIds);
    for (const r of (rooms ?? []) as Array<{ id: string; name: string }>) nameById.set(r.id, r.name);
  }
  return rows.map((r) => ({ id: r.id, childName: r.child_name, classroom: r.classroom_id ? nameById.get(r.classroom_id) ?? null : null, pickupCode: r.pickup_code }));
}

// Convert a held reservation into an actual check-in on arrival.
export async function arriveHeld(workspaceId: string, checkinId: string): Promise<{ ok: boolean; childName?: string; pickupCode?: string }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false };
  const { data } = await db
    .from("child_checkins")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
    .eq("id", checkinId)
    .eq("workspace_id", workspaceId)
    .eq("status", "held")
    .select("child_name, pickup_code")
    .maybeSingle();
  if (!data) return { ok: false };
  const row = data as { child_name?: string; pickup_code?: string };
  return { ok: true, childName: row.child_name, pickupCode: row.pickup_code };
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
