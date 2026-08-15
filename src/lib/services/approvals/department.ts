// Department-join approvals backed by the approvals table (quorum 'any').
// The tappable Approve/Decline buttons AND the agent tools both route here,
// so a decision is recorded per approver and the membership resolves exactly
// once. Matches by row id — never by name string.

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { recordDecision, resolveQuorum } from "@/lib/services/approvals/quorum";

export type DepartmentDecision = {
  status: "approved" | "declined";
  memberName: string;
  unitName: string;
  memberPhone: string | null;
  otherApprovers: string[];
};

export async function startDepartmentApproval(
  workspaceId: string,
  membershipId: string,
  approverPhones: string[],
): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db) return;
  const { error } = await db.from("approvals").insert({
    workspace_id: workspaceId,
    request_id: membershipId,
    kind: "dept_join",
    quorum: "any",
    approver_phones: approverPhones,
  });
  if (error) console.error("[approvals] failed to open dept approval:", error.message);
}

/**
 * Records a leader's decision on a pending department join. When the quorum
 * resolves, the membership row is flipped and the caller gets everything they
 * need to notify the member and the other approvers. Returns null when the
 * request is unknown or already resolved.
 */
export async function decideDepartmentRequest(
  membershipId: string,
  byPhone: string,
  decision: "approve" | "decline",
): Promise<DepartmentDecision | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const { data: approval } = await db
    .from("approvals")
    .select("*")
    .eq("request_id", membershipId)
    .eq("kind", "dept_join")
    .eq("status", "open")
    .maybeSingle();
  if (!approval) return null;

  const row = approval as {
    id: string;
    approver_phones: string[];
    decisions: Array<{ by: string; decision: "approve" | "decline"; at: string }>;
  };

  const decisions = recordDecision(row.decisions ?? [], byPhone, decision, new Date().toISOString());
  const status = resolveQuorum("any", 1, row.approver_phones.length, decisions);

  const { data: membership } = await db
    .from("department_memberships")
    .select("*")
    .eq("id", membershipId)
    .maybeSingle();
  const m = membership as {
    member_name?: string;
    unit_name?: string;
    member_phone?: string | null;
  } | null;

  if (status === "open") {
    await db.from("approvals").update({ decisions }).eq("id", row.id);
    return null; // still open — nothing to announce yet
  }

  await db.from("approvals").update({ decisions, status, resolved_at: new Date().toISOString() }).eq("id", row.id);
  await db.from("department_memberships").update({ status }).eq("id", membershipId);

  return {
    status,
    memberName: m?.member_name ?? "the member",
    unitName: m?.unit_name ?? "the ministry",
    memberPhone: m?.member_phone ?? null,
    otherApprovers: row.approver_phones.filter((p) => p !== byPhone),
  };
}
