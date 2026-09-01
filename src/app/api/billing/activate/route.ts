import { NextRequest, NextResponse } from "next/server";
import { activateSubscriptionDemo, demoBillingEnabled } from "@/lib/services/billing/subscription";

export const dynamic = "force-dynamic";

// Completes a PLACEHOLDER subscription activation: flips the org's subscription
// active for a demo period. No real charge. This is the seam where a real
// Paystack subscription / bank flow will slot in — which will carry proper
// authenticated + webhook-verified authorization.
//
// SECURITY: this demo endpoint has no per-user auth (the /billing page is an
// unauthenticated link), so it is OFF in production unless ALLOW_DEMO_BILLING is
// explicitly set — it can never silently activate a church's billing in prod.
// A same-origin (Origin header) check adds cheap CSRF resistance for the form POST.
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!demoBillingEnabled()) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  // CSRF: reject cross-site form posts (a browser always sends Origin on POST).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const form = await request.formData();
  const org = String(form.get("org") ?? "").trim();
  if (!org) return NextResponse.redirect(new URL("/billing/unknown", request.url), 303);
  await activateSubscriptionDemo(org);
  return NextResponse.redirect(new URL(`/billing/${org}?activated=1`, request.url), 303);
}
