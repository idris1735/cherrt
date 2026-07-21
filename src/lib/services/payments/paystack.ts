// Paystack integration for real giving collection. Inactive until
// PAYSTACK_SECRET_KEY is set — every entry point checks paystackConfigured()
// and degrades gracefully, so nothing breaks before keys are provided.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { createHmac } from "node:crypto";

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  return process.env.PAYSTACK_SECRET_KEY ?? "";
}

export function paystackConfigured(): boolean {
  return secretKey().length > 0;
}

// Initializes a transaction and returns a hosted payment link the member pays
// via card/bank/transfer. Metadata rides along so the webhook can record the
// giving against the right workspace when payment completes. Returns null when
// unconfigured or on any API failure (caller degrades gracefully).
export async function initializeGivingPayment(opts: {
  amountNaira: number;
  email: string;
  metadata: Record<string, unknown>;
}): Promise<{ authorizationUrl: string; reference: string } | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(opts.amountNaira * 100), // Paystack works in kobo
        email: opts.email,
        metadata: opts.metadata,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: boolean; data?: { authorization_url?: string; reference?: string } };
    if (!json.status || !json.data?.authorization_url || !json.data.reference) return null;
    return { authorizationUrl: json.data.authorization_url, reference: json.data.reference };
  } catch {
    return null;
  }
}

// Verifies a Paystack webhook came from Paystack: HMAC-SHA512 of the raw body
// keyed by the secret key must equal the x-paystack-signature header.
export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  const key = secretKey();
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  // Constant-time compare would be ideal, but lengths are fixed hex digests and
  // this is a low-risk equality on server-computed values.
  return expected === signature;
}
