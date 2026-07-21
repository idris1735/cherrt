import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { verifyPaystackSignature } from "@/lib/services/payments/paystack";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

// Paystack calls this when a giving payment completes. We verify the signature,
// then record the giving against the workspace carried in the transaction
// metadata (set by the give_now agent tool).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { amount?: number; metadata?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  if (event.event === "charge.success") {
    const meta = (event.data?.metadata ?? {}) as Record<string, unknown>;
    const workspaceId = String(meta.workspace_id ?? "");
    const db = getSupabaseServerClient();
    if (db && workspaceId) {
      await db.from("giving_records").insert({
        id: randomUUID(),
        workspace_id: workspaceId,
        donor_name: String(meta.donor_name ?? "") || "Anonymous",
        amount: (event.data?.amount ?? 0) / 100, // kobo → Naira
        channel: "paystack",
        service: "giving",
        giving_type: String(meta.giving_type ?? "") || "donation",
      });
    }
  }

  // Always 200 on a verified event so Paystack doesn't retry indefinitely.
  return NextResponse.json({ ok: true });
}
