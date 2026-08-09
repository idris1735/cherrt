import { getSupabaseServerClient } from "@/lib/services/supabase-server";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BUCKET = "kyc";

export async function uploadKycFile(path: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await (db as any).storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  return !error;
}

export async function signedKycUrl(path: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await (db as any).storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
