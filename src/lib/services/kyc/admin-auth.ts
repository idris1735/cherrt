import { getSupabaseUserClient } from "@/lib/services/supabase-server";

// Always-on platform admins: these emails can open the admin dashboard
// automatically, even when they aren't listed in PLATFORM_ADMIN_EMAILS.
export const BUILT_IN_ADMIN_EMAILS = ["donotreply@chertt.com"];

// Single source of truth for who may use the admin dashboard:
// env-driven PLATFORM_ADMIN_EMAILS first, then built-ins (deduped, lowercase).
export function platformAdminAllowlist(): string[] {
  const env = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...env, ...BUILT_IN_ADMIN_EMAILS])];
}

// Verifies a caller's Supabase JWT and returns their email IFF it's on the
// platform-admin allowlist (PLATFORM_ADMIN_EMAILS + built-ins). Returns null
// otherwise. This is the single server-side gate for the admin console.
export async function platformAdminEmail(token: string | null): Promise<string | null> {
  if (!token) return null;
  const client = getSupabaseUserClient(token);
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  return platformAdminAllowlist().includes(email) ? email : null;
}
