import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type EnsurePersonParams = {
  workspaceId: string;
  fullName: string;
  phone?: string;
};

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
