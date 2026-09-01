// Subscription billing — PLACEHOLDER. The church→Chertt side of payments.
//
// No real charge is wired yet: activateSubscriptionDemo() flips the org's
// subscription active for a demo period so the whole gated experience can be
// exercised end-to-end. This module is the single seam where a real Paystack
// subscription / bank flow will slot in (mirrors how giving has a demo path
// today and swaps to real Paystack when keyed).
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type Subscription = { status: SubscriptionStatus; plan: string | null; expiresAt: string | null };

export const PLACEHOLDER_PLAN = "Chertt Standard";
const DEMO_PERIOD_DAYS = 30;

// The demo activation writes org billing state with NO per-user auth (the
// /billing page is reached by an unauthenticated link). So it's OFF in
// production unless ALLOW_DEMO_BILLING=true is explicitly set — safe by default,
// still demoable in dev/preview. Once real Paystack billing exists, this whole
// demo path is replaced by an authenticated + webhook-verified flow.
export function demoBillingEnabled(): boolean {
  if (process.env.ALLOW_DEMO_BILLING === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export async function getSubscription(organizationId: string): Promise<Subscription | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await db
    .from("organizations")
    .select("subscription_status, subscription_plan, subscription_expires_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (!data) return null;
  const r = data as { subscription_status?: string; subscription_plan?: string | null; subscription_expires_at?: string | null };
  return {
    status: (r.subscription_status as SubscriptionStatus) ?? "active",
    plan: r.subscription_plan ?? null,
    expiresAt: r.subscription_expires_at ?? null,
  };
}

// PLACEHOLDER activation — NO real charge. Flips the subscription active for a
// demo period. Returns the new state, or null if storage is unavailable.
export async function activateSubscriptionDemo(organizationId: string, plan?: string): Promise<Subscription | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const expiresAt = new Date(Date.now() + DEMO_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const chosen = plan || PLACEHOLDER_PLAN;
  const { error } = await db
    .from("organizations")
    .update({ subscription_status: "active", subscription_plan: chosen, subscription_expires_at: expiresAt })
    .eq("id", organizationId);
  if (error) return null;
  return { status: "active", plan: chosen, expiresAt };
}

// Resolve a workspace's org + subscription in one hop, for the WhatsApp
// "subscription" status command. Null when the workspace has no organization
// (standalone/demo) or storage is unavailable.
export async function getWorkspaceBilling(workspaceId: string): Promise<{ organizationId: string; sub: Subscription } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data: ws } = await db.from("workspaces").select("organization_id").eq("id", workspaceId).maybeSingle();
  const orgId = (ws as { organization_id?: string | null } | null)?.organization_id;
  if (!orgId) return null;
  const sub = (await getSubscription(orgId)) ?? { status: "active" as SubscriptionStatus, plan: null, expiresAt: null };
  return { organizationId: orgId, sub };
}

// Pure: is this subscription currently valid? Unknown (null) fails OPEN, matching
// the connect gate's philosophy — never wrongly turn a legitimate church away.
export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return true;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) return false;
  return true;
}
