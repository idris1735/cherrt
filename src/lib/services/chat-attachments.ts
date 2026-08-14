// WS-A: persisted chat attachments. Inbound WhatsApp media (photo / voice /
// document) is downloaded from Meta, uploaded to the private
// `chat-attachments` bucket, and recorded in `chat_attachments` — so the AI
// can never claim a "phantom save": a tool only confirms what's really stored.
// Everything here is best-effort: persistence must never block the reply.

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";

export type AttachmentKind = "image" | "document" | "audio" | "other";

export type StoredAttachment = {
  id: string;
  kind: string;
  mimeType: string | null;
  caption: string | null;
  confirmedAt: string | null;
  createdAt: string;
  storagePath: string;
};

function extFor(kind: AttachmentKind, mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mp4") || m.includes("webm")) return kind === "audio" ? "m4a" : "mp4";
  return "bin";
}

export async function persistChatAttachment(opts: {
  workspaceId: string | null;
  personId: string | null;
  kind: AttachmentKind;
  buffer: Buffer;
  mimeType: string;
  caption?: string | null;
}): Promise<{ id: string; storagePath: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  try {
    const id = randomUUID();
    const folder = opts.workspaceId ? `${opts.workspaceId}/${opts.personId ?? "unlinked"}` : "unlinked";
    const path = `${folder}/${id}.${extFor(opts.kind, opts.mimeType)}`;
    const { error: upErr } = await (db as any).storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .upload(path, opts.buffer, { contentType: opts.mimeType || "application/octet-stream", upsert: false });
    if (upErr) {
      console.error("[chat-attachments] upload failed:", upErr.message);
      return null;
    }
    const { data, error } = await db
      .from("chat_attachments")
      .insert({
        id,
        workspace_id: opts.workspaceId,
        person_id: opts.personId,
        kind: opts.kind,
        storage_path: path,
        mime_type: opts.mimeType || null,
        caption: opts.caption ?? null,
        source: "whatsapp",
      })
      .select("id, storage_path")
      .single();
    if (error) {
      console.error("[chat-attachments] row insert failed:", error.message);
      return null;
    }
    return { id: (data as { id: string }).id, storagePath: (data as { storage_path: string }).storage_path };
  } catch (e) {
    console.error("[chat-attachments] persist failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// The person's most recent attachment that nobody has explicitly confirmed —
// the only thing save_attachment may claim to have saved.
export async function latestUnconfirmedAttachment(personId: string, withinMinutes = 15): Promise<StoredAttachment | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await db
    .from("chat_attachments")
    .select("id, kind, mime_type, caption, confirmed_at, created_at, storage_path")
    .eq("person_id", personId)
    .is("confirmed_at", null)
    .gte("created_at", new Date(Date.now() - withinMinutes * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    kind: String(r.kind),
    mimeType: (r.mime_type as string) ?? null,
    caption: (r.caption as string) ?? null,
    confirmedAt: (r.confirmed_at as string) ?? null,
    createdAt: String(r.created_at),
    storagePath: String(r.storage_path),
  };
}

export async function confirmAttachment(id: string, caption?: string | null): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const patch: Record<string, unknown> = { confirmed_at: new Date().toISOString() };
  if (caption) patch.caption = caption;
  const { error } = await db.from("chat_attachments").update(patch).eq("id", id);
  if (error) {
    console.error("[chat-attachments] confirm failed:", error.message);
    return false;
  }
  return true;
}

export async function listPersonAttachments(personId: string, limit = 50): Promise<StoredAttachment[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data } = await db
    .from("chat_attachments")
    .select("id, kind, mime_type, caption, confirmed_at, created_at, storage_path")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    mimeType: (r.mime_type as string) ?? null,
    caption: (r.caption as string) ?? null,
    confirmedAt: (r.confirmed_at as string) ?? null,
    createdAt: String(r.created_at),
    storagePath: String(r.storage_path),
  }));
}

export async function signedAttachmentUrl(storagePath: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  try {
    const { data } = await (db as any).storage.from(CHAT_ATTACHMENTS_BUCKET).createSignedUrl(storagePath, 60 * 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
