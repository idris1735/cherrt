import { getSupabaseBrowserClient } from "@/lib/services/supabase";

// Fetches an admin API route with the caller's Supabase session JWT.
// Returns { status, data } — status 401 means "not authorized".
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T | null }> {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  const res = await fetch(path, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
  const data = res.ok ? ((await res.json()) as T) : null;
  return { status: res.status, data };
}
