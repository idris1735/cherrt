// Curated per-vertical role catalog for the identity spine.
// See docs/superpowers/specs/2026-07-21-identity-tenancy-spine-design.md
//
// Capability bundles (what a role can DO) are enforced through the existing
// command-engine/policy-guard.ts. This module owns the *ranking* used for the
// assign-role privilege-escalation guard, plus which role a given vertical
// seats new people into at onboarding.

import type { ModuleKey } from "@/lib/types";

// Authority rank. Higher = more authority. The assign-role guard uses this so
// an actor can never grant a role that outranks their own. Kept deliberately
// coarse — bundles (in policy-guard) decide fine-grained capability, this only
// decides "can X hand out role Y".
const ROLE_RANK: Record<string, number> = {
  member: 0,
  staff: 0,
  children: 1,
  dept_leader: 1,
  secretary: 2,
  operations: 2,
  finance: 3,
  approver: 3,
  pastoral: 4,
  pastor: 4,
  manager: 4,
  admin: 5,
  owner: 6,
  senior_pastor: 6,
};

// Only roles at this rank or above may assign roles at all (manager, pastor,
// admin, owner, senior_pastor). finance/secretary and below cannot.
const ASSIGN_MIN_RANK = 4;

export function roleRank(role: string): number {
  return ROLE_RANK[role] ?? 0;
}

// True when `actorRole` is allowed to set someone's role to `targetRole`:
// the actor must have assign authority AND must not grant a role that
// outranks their own (no privilege escalation).
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  const actor = roleRank(actorRole);
  if (actor < ASSIGN_MIN_RANK) return false;
  return roleRank(targetRole) <= actor;
}

// The roles an admin is offered when reassigning someone, for a given
// vertical — the catalog, minus org-level seats that aren't hand-assignable
// per-branch (senior_pastor/owner are established at provisioning, not here).
const ASSIGNABLE_ROLES_BY_VERTICAL: Record<ModuleKey, string[]> = {
  church: ["pastor", "finance", "secretary", "children", "dept_leader", "member"],
  toolkit: ["manager", "finance", "staff"],
  store: ["manager", "staff"],
  events: ["manager", "staff"],
};

export function assignableRoles(vertical: ModuleKey): string[] {
  return ASSIGNABLE_ROLES_BY_VERTICAL[vertical] ?? ["member"];
}

// The role a newly-provisioned person is seated into, by how they arrived.
// Founding org admin is always senior_pastor (church) / owner (other
// verticals); a branch admin claiming a code becomes the branch-lead role.
export function foundingAdminRole(vertical: ModuleKey): string {
  return vertical === "church" ? "senior_pastor" : "owner";
}

export function branchLeadRole(vertical: ModuleKey): string {
  return vertical === "church" ? "pastor" : "manager";
}
