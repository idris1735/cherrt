// P0-5 — #reset command support. Wipes ONE sender's own footprint only:
// their session, their phone→workspace links, and their person records
// (phone_contacts → branch_memberships → people). Never touches anyone else.
// Safe for the owner to role-test from scratch without code changes.

import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export async function resetSenderData(phone: string): Promise<{ wiped: string[] }> {
  const db = getSupabaseServerClient();
  if (!db) return { wiped: [] };
  const wiped: string[] = [];

  // Identity spine: find every person row this phone points at.
  const { data: contacts } = await db
    .from("phone_contacts")
    .select("id, person_id")
    .eq("phone_number", phone);
  const rows = (contacts ?? []) as Array<{ id: string; person_id: string }>;
  const contactIds = rows.map((r) => r.id);
  const personIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))];

  if (contactIds.length) {
    const { error } = await db.from("phone_contacts").delete().in("id", contactIds);
    if (!error) wiped.push("phone_contacts");
  }
  if (personIds.length) {
    const { error: bErr } = await db.from("branch_memberships").delete().in("person_id", personIds);
    if (!bErr) wiped.push("branch_memberships");
    const { error: pErr } = await db.from("people").delete().in("id", personIds);
    if (!pErr) wiped.push("people");
  }

  // Legacy links + conversation memory for this number.
  const { error: lErr } = await db.from("whatsapp_phone_links").delete().eq("phone_number", phone);
  if (!lErr) wiped.push("whatsapp_phone_links");
  const { error: mErr } = await db.from("whatsapp_processed_messages").delete().eq("from_phone", phone);
  if (!mErr) wiped.push("whatsapp_processed_messages");

  return { wiped };
}
