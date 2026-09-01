import { NextRequest, NextResponse } from "next/server";
import { activateSubscriptionDemo } from "@/lib/services/billing/subscription";

export const dynamic = "force-dynamic";

// Completes a PLACEHOLDER subscription activation: flips the org's subscription
// active for a demo period. No real charge. This is the seam where a real
// Paystack subscription / bank flow will slot in.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const org = String(form.get("org") ?? "").trim();
  if (!org) return NextResponse.redirect(new URL("/billing/unknown", request.url), 303);
  await activateSubscriptionDemo(org);
  return NextResponse.redirect(new URL(`/billing/${org}?activated=1`, request.url), 303);
}
