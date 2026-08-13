import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { sendTextMessage } from "@/lib/services/whatsapp";
import { roleRank } from "@/lib/services/identity/role-catalog";

/**
 * Notify branch leaders on WhatsApp about a new prayer/pastoral/care request.
 * Resolves leaders from branch_memberships (active, min role rank), looks up
 * their phone from phone_contacts, and sends each a concise privacy-appropriate
 * alert. Best-effort — never blocks the capture.
 */
export async function notifyLeaders(params: {
  workspaceId: string;
  roleAtLeast?: string;
  message: string;
}): Promise<void> {
  const { workspaceId, roleAtLeast = "dept_leader", message } = params;
  const db = getSupabaseServerClient();
  if (!db) return;

  const minRank = roleRank(roleAtLeast);

  // Find leaders in this workspace
  const { data: memberships } = await db
    .from("branch_memberships")
    .select("person_id, role")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  const leaderIds = (memberships ?? [])
    .filter((m: any) => roleRank(m.role) >= minRank)
    .map((m: any) => m.person_id);

  if (!leaderIds.length) return;

  // Get their phone numbers
  const { data: contacts } = await db
    .from("phone_contacts")
    .select("person_id, phone_number")
    .in("person_id", leaderIds)
    .eq("status", "active");

  // Send each leader a WhatsApp alert (best-effort, logged)
  const outcomes: Array<{ phone: string; ok: boolean }> = [];
  for (const c of (contacts ?? []) as Array<{ phone_number: string }>) {
    if (c.phone_number) {
      try {
        await sendTextMessage(c.phone_number, message);
        outcomes.push({ phone: c.phone_number, ok: true });
      } catch {
        outcomes.push({ phone: c.phone_number, ok: false });
        // never block — notification is a bonus
      }
    }
  }
  if (outcomes.some((o) => !o.ok)) {
    console.warn(`[referral] notifyLeaders partial failure for ${workspaceId}:`, JSON.stringify(outcomes));
  }
}
