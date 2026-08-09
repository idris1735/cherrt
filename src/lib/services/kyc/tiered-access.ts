import { getSupabaseServerClient } from "@/lib/services/supabase-server";

// Defense-in-depth: a workspace normally only exists after KYC approval, but
// this guard makes "unverified churches can do nothing sensitive" explicit.
// Approved = the workspace's organization is 'active'. No org row (legacy/demo)
// counts as approved so existing workspaces are never broken.
export async function churchApproved(workspaceId: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return true; // fail open — storage issues shouldn't block existing churches
  try {
    const { data: ws } = await db.from("workspaces").select("organization_id").eq("id", workspaceId).maybeSingle();
    const orgId = (ws as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return true;
    const { data: org } = await db.from("organizations").select("status").eq("id", orgId).maybeSingle();
    const status = (org as { status: string } | null)?.status;
    if (!status) return true;
    return status === "active";
  } catch {
    return true; // fail open — never block an existing church on a lookup error
  }
}
