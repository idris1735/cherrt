import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type MilestoneType =
  | "salvation" | "baptism" | "child_dedication" | "marriage"
  | "joined_membership" | "bereavement" | "other";

/** Insert a milestone on a person's timeline. Best-effort caller pattern. */
export async function recordMilestone(params: {
  personId: string;
  workspaceId: string;
  type: MilestoneType;
  occurredOn?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;
  await db.from("person_milestones").insert({
    id: randomUUID(),
    person_id: params.personId,
    workspace_id: params.workspaceId,
    type: params.type,
    occurred_on: params.occurredOn?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    details: params.details ?? {},
  });
}
