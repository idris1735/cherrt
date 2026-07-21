// Deterministic, guided assign-role flow (identity spine). An authorized admin
// changes an existing branch member's role by picking from numbered lists — no
// fuzzy natural-language name resolution (that's the agent's job later).
// See docs/superpowers/specs/2026-07-21-identity-tenancy-spine-design.md

import { updateSession, type WhatsAppSession } from "@/lib/services/whatsapp-session";
import { listBranchMembers, setMembershipRole } from "@/lib/services/identity/provisioning";
import { assignableRoles, canAssignRole, roleRank } from "@/lib/services/identity/role-catalog";

// The WhatsApp onboarding flow is church-oriented, so this is the vertical
// whose catalog we offer. (SME/store/events WhatsApp onboarding isn't a thing
// yet; when it is, thread the workspace's vertical through here.)
const VERTICAL = "church" as const;

export const ASSIGN_ROLE_TRIGGER_RE = /\b(assign|change|set|update|manage)\b.{0,14}\broles?\b/i;

export function isAssignRoleTrigger(text: string): boolean {
  return ASSIGN_ROLE_TRIGGER_RE.test(text.trim());
}

function memberList(candidates: Array<{ fullName: string; role: string }>): string {
  return candidates.map((m, i) => `${i + 1}. ${m.fullName || "(no name)"} — ${m.role}`).join("\n");
}

function roleList(roleOptions: string[]): string {
  return roleOptions.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

// Starts the flow. Returns the first prompt, or a plain explanation when the
// actor has no assignable roles / no one they're allowed to reassign.
export async function startAssignRoleFlow(
  phoneNumber: string,
  workspaceId: string,
  actorRole: string,
): Promise<string> {
  const roleOptions = assignableRoles(VERTICAL).filter((r) => canAssignRole(actorRole, r));
  if (!roleOptions.length) {
    return "You don't have permission to change roles here.";
  }

  const members = await listBranchMembers(workspaceId);
  // Can only reassign people whose current role doesn't outrank the actor.
  const candidates = members.filter((m) => roleRank(m.role) <= roleRank(actorRole));
  if (!candidates.length) {
    return "There's no one here whose role you can change yet.";
  }

  await updateSession(phoneNumber, {
    onboarding: { flow: "assign-role", step: "pick_member", collected: { workspaceId, actorRole, candidates, roleOptions } },
  });

  return `Who do you want to change the role for?\n\n${memberList(candidates)}\n\nReply with a number, or *cancel*.`;
}

export async function advanceAssignRoleFlow(
  phoneNumber: string,
  session: WhatsAppSession,
  replyText: string,
): Promise<string | null> {
  const state = session.onboarding;
  if (!state || state.flow !== "assign-role") return null;

  const trimmed = replyText.trim();
  const c = state.collected;

  if (/^cancel$/i.test(trimmed)) {
    await updateSession(phoneNumber, { onboarding: undefined });
    return "No change made. What else can I help you with?";
  }

  if (state.step === "pick_member") {
    const n = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
    if (!n || n < 1 || n > c.candidates.length) {
      return `Please reply with a number from the list.\n\n${memberList(c.candidates)}`;
    }
    const target = c.candidates[n - 1];
    await updateSession(phoneNumber, {
      onboarding: {
        flow: "assign-role",
        step: "pick_role",
        collected: { ...c, targetPersonId: target.personId, targetName: target.fullName },
      },
    });
    return `What role should ${target.fullName || "they"} have?\n\n${roleList(c.roleOptions)}\n\nReply with a number, or *cancel*.`;
  }

  if (state.step === "pick_role") {
    const n = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
    if (!n || n < 1 || n > c.roleOptions.length) {
      return `Please reply with a number from the list.\n\n${roleList(c.roleOptions)}`;
    }
    const chosenRole = c.roleOptions[n - 1];
    await updateSession(phoneNumber, {
      onboarding: { flow: "assign-role", step: "confirm", collected: { ...c, chosenRole } },
    });
    return `Set *${c.targetName || "this member"}* as *${chosenRole}*? Reply YES or NO.`;
  }

  // confirm
  if (/^(yes|y|confirm)$/i.test(trimmed)) {
    const ok =
      c.targetPersonId && c.chosenRole
        ? await setMembershipRole(c.targetPersonId, c.workspaceId, c.chosenRole)
        : false;
    await updateSession(phoneNumber, { onboarding: undefined });
    return ok
      ? `Done — ${c.targetName || "they"} is now ${c.chosenRole}.`
      : "Couldn't update that role — they may no longer be a member here.";
  }
  if (/^(no|n)$/i.test(trimmed)) {
    await updateSession(phoneNumber, { onboarding: undefined });
    return "No change made. What else can I help you with?";
  }
  return "Reply YES to confirm, or NO to cancel.";
}
