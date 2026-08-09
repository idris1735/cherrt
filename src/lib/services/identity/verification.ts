import { getSupabaseServerClient } from "@/lib/services/supabase-server";

// L0 unknown · L1 number-verified (active contact with verified_at) · L2
// identity-verified (Mono NIN — a later slice; never returned here yet).
export async function verificationLevel(personId: string): Promise<0 | 1 | 2> {
  const db = getSupabaseServerClient();
  if (!db) return 0;
  const { data } = await db
    .from("phone_contacts")
    .select("id")
    .eq("person_id", personId)
    .eq("status", "active")
    .not("verified_at", "is", null)
    .maybeSingle();
  return data ? 1 : 0;
}
