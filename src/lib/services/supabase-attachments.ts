import { getSupabaseBrowserClient } from "@/lib/services/supabase";

const BUCKET = "workspace-attachments";

export async function uploadAttachment(
  workspaceId: string,
  recordType: "expenses" | "issues",
  recordId: string,
  file: File,
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${workspaceId}/${recordType}/${recordId}/${Date.now()}.${ext}`;

  const { error } = await (supabase as any).storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return null;

  const { data } = (supabase as any).storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function appendAttachmentUrl(
  table: "toolkit_expense_entries" | "toolkit_issue_reports",
  recordId: string,
  url: string,
  currentUrls: string[],
): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;

  const { error } = await (supabase as any)
    .from(table)
    .update({ attachment_urls: [...currentUrls, url] })
    .eq("id", recordId);

  return !error;
}
