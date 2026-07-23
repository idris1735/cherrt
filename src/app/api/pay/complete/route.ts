import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { sendTextMessage } from "@/lib/services/whatsapp";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Completes a DEMO giving payment: marks it paid, records the giving (idempotent
// on the reference), and sends the donor a WhatsApp receipt. Then redirects
// back to the checkout page in its "received" state.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const reference = String(form.get("reference") ?? "").trim();
  const back = new URL(`/pay/${reference}?paid=1`, request.url);
  if (!reference) return NextResponse.redirect(new URL("/pay/unknown", request.url), 303);

  const db = getSupabaseServerClient();
  if (db) {
    const { data } = await db.from("demo_payments").select("id, workspace_id, amount, giving_type, donor_name, donor_person_id, donor_phone, status").eq("reference", reference).maybeSingle();
    const dp = data as any;
    if (dp && dp.status === "pending") {
      await db.from("demo_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", dp.id);
      // Idempotent on (workspace_id, payment_reference) — a re-submit won't double-count.
      await db.from("giving_records").insert({
        id: randomUUID(),
        workspace_id: dp.workspace_id,
        person_id: dp.donor_person_id ?? null,
        donor_name: dp.donor_name || "Anonymous",
        amount: dp.amount,
        channel: "demo",
        service: "giving",
        giving_type: dp.giving_type || "offering",
        payment_reference: reference,
      });
      if (dp.donor_phone) {
        try {
          await sendTextMessage(dp.donor_phone, `✅ Your ₦${Number(dp.amount).toLocaleString("en-NG")} ${dp.giving_type} has been received. Thank you, and God bless you! 🙏`);
        } catch { /* best-effort */ }
      }
    }
  }
  return NextResponse.redirect(back, 303);
}
