// Identity resolution for the person-centric spine.
// See docs/superpowers/specs/2026-07-21-identity-tenancy-spine-design.md
//
// Turns an inbound phone number into the human behind it, their branch
// memberships (with roles), and whether they hold org-wide oversight.
// Replaces lookupAllPhoneLinks/resolveActivePhoneLink over the new tables,
// keeping the same disambiguation shape (pure pickActiveMembership, testable).

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { normalizePhoneNumber } from "@/lib/services/phone";

export type BranchMembership = {
  personId: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  unit: string | null;
};

export type ResolvedIdentity = {
  person: { id: string; fullName: string };
  memberships: BranchMembership[];
  isOrgAdmin: boolean;
};

// Pure resolution: which membership to act under, or null when it's genuinely
// ambiguous (more than one branch and no active context yet) and the caller
// must prompt for disambiguation. Mirrors resolveActivePhoneLink so the
// existing "which church is this about?" UX carries over unchanged.
export function pickActiveMembership(
  memberships: BranchMembership[],
  activeWorkspaceId?: string | null,
): BranchMembership | null {
  if (memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0];
  if (activeWorkspaceId) {
    const match = memberships.find((m) => m.workspaceId === activeWorkspaceId);
    if (match) return match;
  }
  return null;
}

// Reads the new identity tables. Returns null when the phone resolves to no
// person yet (guest / unlinked — caller falls through to JOIN or guest flow).
export async function resolveIdentityByPhone(rawPhone: string): Promise<ResolvedIdentity | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const phone = normalizePhoneNumber(rawPhone) ?? rawPhone;

  const { data: contact } = await db
    .from("phone_contacts")
    .select("person_id, people(id, full_name)")
    .eq("phone_number", phone)
    .eq("status", "active")
    .maybeSingle();

  if (!contact) return null;

  const personId = contact.person_id as string;
  const peopleJoin = (contact as { people?: { full_name?: string } | { full_name?: string }[] }).people;
  const person = Array.isArray(peopleJoin) ? peopleJoin[0] : peopleJoin;
  const fullName = person?.full_name ?? "";

  const { data: memRows } = await db
    .from("branch_memberships")
    .select("workspace_id, role, unit, workspaces(name)")
    .eq("person_id", personId)
    .eq("status", "active");

  const memberships: BranchMembership[] = (memRows ?? []).map((r) => {
    const wsJoin = (r as { workspaces?: { name?: string } | { name?: string }[] }).workspaces;
    const ws = Array.isArray(wsJoin) ? wsJoin[0] : wsJoin;
    return {
      personId,
      workspaceId: (r as { workspace_id: string }).workspace_id,
      workspaceName: ws?.name ?? "",
      role: (r as { role?: string }).role ?? "member",
      unit: (r as { unit?: string | null }).unit ?? null,
    };
  });

  const { data: orgAdminRows } = await db
    .from("organization_admins")
    .select("id")
    .eq("person_id", personId)
    .limit(1);

  return {
    person: { id: personId, fullName },
    memberships,
    isOrgAdmin: (orgAdminRows ?? []).length > 0,
  };
}
