// WS5 — outbound delivery visibility. Meta sends statuses (sent / delivered /
// read / failed) per message id; we log failures + undelivered so a message
// never silently vanishes. Best-effort — never throws, never blocks the webhook.

import { getSupabaseServerClient } from "@/lib/services/supabase-server";

const KNOWN = new Set(["sent", "delivered", "read", "failed"]);

export async function recordDeliveryStatus(params: {
  messageId: string;
  to: string;
  status: string;
  error?: string;
}): Promise<void> {
  const status = String(params.status ?? "").toLowerCase();
  if (!KNOWN.has(status)) return;
  const db = getSupabaseServerClient();
  if (!db) return;
  try {
    await db.from("whatsapp_send_logs").insert({
      direction: "outbound",
      kind: "status",
      to_phone: params.to,
      status, // sent | delivered | read | failed
      error: params.error ? params.error.slice(0, 500) : null,
      payload: { messageId: params.messageId },
    });
  } catch {
    // logging must never cascade into the webhook
  }
}
