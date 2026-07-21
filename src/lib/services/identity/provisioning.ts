// Writes the person-centric identity model, and (during cutover) dual-writes
// the legacy whatsapp_phone_links so the live message path keeps working.
// See docs/superpowers/specs/2026-07-21-identity-tenancy-spine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { normalizePhoneNumber } from "@/lib/services/phone";

// Find-or-create the Person behind a phone, then seat them in a branch with a
// role. Idempotent on (person, workspace). Optionally records org-admin
// (person-based) when organizationId is given. Returns the person id, or null
// if there's no DB handle / the person couldn't be created.
export async function provisionPersonMembership(opts: {
  phoneNumber: string;
  fullName: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: string;
  organizationId?: string;
}): Promise<{ personId: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;

  const phone = normalizePhoneNumber(opts.phoneNumber) ?? opts.phoneNumber;

  let personId: string;
  const { data: contact } = await db
    .from("phone_contacts")
    .select("person_id")
    .eq("phone_number", phone)
    .eq("status", "active")
    .maybeSingle();

  if (contact?.person_id) {
    personId = contact.person_id as string;
    // Fill in a name we just learned if the person was created nameless.
    if (opts.fullName) {
      await db.from("people").update({ full_name: opts.fullName }).eq("id", personId).eq("full_name", "");
    }
  } else {
    const { data: person, error } = await db
      .from("people")
      .insert({ full_name: opts.fullName ?? "" })
      .select("id")
      .single();
    if (error || !person) {
      console.error("provisionPersonMembership: create person failed:", error?.message);
      return null;
    }
    personId = person.id as string;
    await db.from("phone_contacts").insert({ phone_number: phone, person_id: personId, status: "active" });
  }

  await db.from("branch_memberships").upsert(
    { person_id: personId, workspace_id: opts.workspaceId, role: opts.role, status: "active" },
    { onConflict: "person_id,workspace_id" },
  );

  if (opts.organizationId) {
    await db.from("organization_admins").upsert(
      { organization_id: opts.organizationId, phone_number: phone, person_id: personId },
      { onConflict: "organization_id,phone_number" },
    );
  }

  // Back-compat dual-write. Inlined (not via linkPhoneToWorkspace) to avoid a
  // module cycle with whatsapp-workspace.
  await db.from("whatsapp_phone_links").upsert(
    {
      phone_number: phone,
      workspace_id: opts.workspaceId,
      workspace_slug: opts.workspaceSlug,
      workspace_name: opts.workspaceName,
      user_name: opts.fullName ?? "",
      user_role: opts.role,
    },
    { onConflict: "phone_number,workspace_id" },
  );

  return { personId };
}

// Change an existing member's role in a branch (assign-role). Returns false
// when they aren't an active member of that branch.
export async function setMembershipRole(
  personId: string,
  workspaceId: string,
  role: string,
): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;

  const { data, error } = await db
    .from("branch_memberships")
    .update({ role })
    .eq("person_id", personId)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error || !data) return false;

  // Keep the legacy phone_links role in sync for this person's active phones.
  const { data: contacts } = await db
    .from("phone_contacts")
    .select("phone_number")
    .eq("person_id", personId)
    .eq("status", "active");

  for (const c of contacts ?? []) {
    await db
      .from("whatsapp_phone_links")
      .update({ user_role: role })
      .eq("phone_number", (c as { phone_number: string }).phone_number)
      .eq("workspace_id", workspaceId);
  }

  return true;
}

export type BranchMemberRow = { personId: string; fullName: string; role: string };

// Active members of a branch, for the assign-role picker.
export async function listBranchMembers(workspaceId: string): Promise<BranchMemberRow[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];

  const { data } = await db
    .from("branch_memberships")
    .select("person_id, role, people(full_name)")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  return (data ?? []).map((r) => {
    const peopleJoin = (r as { people?: { full_name?: string } | { full_name?: string }[] }).people;
    const person = Array.isArray(peopleJoin) ? peopleJoin[0] : peopleJoin;
    return {
      personId: (r as { person_id: string }).person_id,
      fullName: person?.full_name ?? "",
      role: (r as { role?: string }).role ?? "member",
    };
  });
}
