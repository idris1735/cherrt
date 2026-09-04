// Children's classrooms + live capacity. A room "occupies a seat" while a child
// is checked_in (or in_class once teacher-acceptance ships). Everything is
// workspace-scoped through the service-role client.
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type ClassroomInfo = {
  id: string;
  name: string;
  capacity: number | null;
  occupancy: number;
  full: boolean; // capacity set and reached
};

// Statuses that occupy a seat right now.
const OCCUPYING = ["checked_in", "in_class"];

export async function listClassroomsWithOccupancy(workspaceId: string): Promise<ClassroomInfo[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data: rooms } = await db
    .from("classrooms")
    .select("id, name, capacity")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .order("name", { ascending: true });
  const list = (rooms ?? []) as Array<{ id: string; name: string; capacity: number | null }>;
  if (!list.length) return [];

  // Current occupancy per room from live check-ins.
  const { data: checkins } = await db
    .from("child_checkins")
    .select("classroom_id")
    .eq("workspace_id", workspaceId)
    .in("status", OCCUPYING);
  const counts = new Map<string, number>();
  for (const c of (checkins ?? []) as Array<{ classroom_id: string | null }>) {
    if (c.classroom_id) counts.set(c.classroom_id, (counts.get(c.classroom_id) ?? 0) + 1);
  }

  return list.map((r) => {
    const occupancy = counts.get(r.id) ?? 0;
    return { id: r.id, name: r.name, capacity: r.capacity, occupancy, full: r.capacity != null && occupancy >= r.capacity };
  });
}

// Capacity check for a single room at commit time (guards against races between
// showing availability and the actual check-in). Returns true if there's room.
export async function classroomHasSpace(workspaceId: string, classroomId: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return true;
  const { data: room } = await db
    .from("classrooms")
    .select("capacity")
    .eq("id", classroomId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!room) return true; // unknown room → don't block
  const capacity = (room as { capacity: number | null }).capacity;
  if (capacity == null) return true; // no limit
  const { data: checkins } = await db
    .from("child_checkins")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("classroom_id", classroomId)
    .in("status", OCCUPYING);
  return ((checkins ?? []) as unknown[]).length < capacity;
}

export async function createClassroom(opts: { workspaceId: string; name: string; capacity?: number | null }): Promise<{ id: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data, error } = await db
    .from("classrooms")
    .insert({ workspace_id: opts.workspaceId, name: opts.name, capacity: opts.capacity ?? null })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: (data as { id: string }).id };
}
