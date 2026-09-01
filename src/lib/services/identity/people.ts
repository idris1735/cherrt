import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type EnsurePersonParams = {
  workspaceId: string;
  fullName: string;
  phone?: string;
};

/** Everything already stored about a person — the "never ask twice" profile. */
export type KnownProfile = {
  fullName?: string;
  phone?: string;
  email?: string;
  gender?: string;
  birthdate?: string;
  address?: string;
  maritalStatus?: string;
  churches: { id: string; name: string; role: string }[];
};

/**
 * Read everything we already hold about a person (identity spine + contacts +
 * memberships). Injected into the agent so it confirms instead of re-asking,
 * and into tools so flows prefill stored fields. Returns null when the person
 * isn't known at all.
 */
export async function getKnownProfile(personId: string): Promise<KnownProfile | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const [personRes, contactRes, membershipsRes] = await Promise.all([
    db.from("people").select("full_name, email, gender, birthdate, address, marital_status").eq("id", personId).maybeSingle(),
    db.from("phone_contacts").select("phone_number").eq("person_id", personId).eq("status", "active").maybeSingle(),
    db.from("branch_memberships").select("workspace_id, role").eq("person_id", personId).eq("status", "active").then((r: any) => (r.data ?? []) as any[]),
  ]);
  const person = personRes.data as any;
  const contact = contactRes.data as any;
  if (!person && !contact) return null;
  const memberships = membershipsRes as any[];
  const wsIds = [...new Set(memberships.map((m) => m.workspace_id))];
  const workspaces = wsIds.length ? (((await db.from("workspaces").select("id, organization_id, name").in("id", wsIds)).data ?? []) as any[]) : [];
  const orgIds = [...new Set(workspaces.map((w) => w.organization_id).filter(Boolean))];
  const orgs = orgIds.length ? (((await db.from("organizations").select("id, name").in("id", orgIds)).data ?? []) as any[]) : [];
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  return {
    fullName: person?.full_name || undefined,
    email: person?.email || undefined,
    gender: person?.gender || undefined,
    birthdate: person?.birthdate || undefined,
    address: person?.address || undefined,
    maritalStatus: person?.marital_status || undefined,
    phone: contact?.phone_number || undefined,
    churches: memberships.map((m) => {
      const ws = wsById.get(m.workspace_id);
      const orgId = ws?.organization_id;
      return {
        id: orgId ?? "",
        name: (orgId ? orgNameById.get(orgId) : undefined) ?? ws?.name ?? "Church",
        role: m.role,
      };
    }),
  };
}

/**
 * Resolve a person by name, SCOPED to a workspace (via active membership).
 *
 * The `people` table is the cross-workspace identity spine — a bare
 * `.eq("full_name", name)` can match a same-named person in ANOTHER church, so
 * every tenant name lookup MUST be scoped through `branch_memberships`. Returns
 * the person id, or null when no active member of this workspace has that name.
 */
export async function resolvePersonIdByNameInWorkspace(workspaceId: string, fullName: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const needle = fullName.trim().toLowerCase();
  if (!needle) return null;

  const { data: mems } = await db
    .from("branch_memberships")
    .select("person_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  const ids = [...new Set(((mems ?? []) as Array<{ person_id?: string }>).map((m) => m.person_id).filter(Boolean) as string[])];
  if (!ids.length) return null;

  // Case-insensitive match within the workspace's members (no cross-tenant leak).
  const { data: people } = await db.from("people").select("id, full_name").in("id", ids);
  return ((people ?? []) as Array<{ id: string; full_name?: string }>)
    .find((p) => String(p.full_name ?? "").trim().toLowerCase() === needle)?.id ?? null;
}

/**
 * Find-or-create a person row linked to a phone contact.
 * Idempotent per (phone): if the phone already points to a person,
 * returns that person. If given a name and the existing person has an
 * empty name, updates it.
 *
 * Does NOT auto-verify — only an inbound WhatsApp message sets verified_at.
 */
export async function ensurePerson(params: EnsurePersonParams): Promise<string> {
  const db = getSupabaseServerClient();
  const { fullName } = params;
  const phone = params.phone?.trim();

  // 1. If a phone is given and already linked to a person, return that person.
  if (phone && db) {
    const { data: existingContact } = await db
      .from("phone_contacts")
      .select("person_id, phone_number")
      .eq("phone_number", phone)
      .eq("status", "active")
      .maybeSingle();

    if (existingContact) {
      const personId = (existingContact as { person_id: string }).person_id;

      // Update the person's name if they previously had an empty one
      if (fullName) {
        const { data: person } = await db
          .from("people")
          .select("full_name")
          .eq("id", personId)
          .maybeSingle();

        if (person && !(person as { full_name: string }).full_name) {
          await db.from("people").update({ full_name: fullName }).eq("id", personId);
        }
      }

      return personId;
    }
  }

  // 2. No existing person linked to this phone — create one.
  if (!db) throw new Error("Supabase unavailable");

  const { data: newPerson } = await db
    .from("people")
    .insert({ full_name: fullName })
    .select("id")
    .single();

  const personId = (newPerson as { id: string }).id;

  // 3. Link the phone (unverified — only inbound WhatsApp verifies)
  if (phone) {
    await db.from("phone_contacts").insert({
      person_id: personId,
      phone_number: phone,
      status: "active",
      verified_at: null,
    });
  }

  return personId;
}
