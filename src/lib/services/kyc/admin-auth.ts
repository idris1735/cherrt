import { getSupabaseUserClient } from "@/lib/services/supabase-server";

function allowlist(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

// Verifies a caller's Supabase JWT and returns their email IFF it's on the
// PLATFORM_ADMIN_EMAILS allowlist. Returns null otherwise. This is the single
// server-side gate for the KYC review console.
export async function platformAdminEmail(token: string | null): Promise<string | null> {
  if (!token) return null;
  const client = getSupabaseUserClient(token);
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  return allowlist().includes(email) ? email : null;
}
