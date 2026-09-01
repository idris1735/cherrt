import { describe, it, expect, vi, beforeEach } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { store } = vi.hoisted(() => ({
  store: { single: {} as Record<string, any>, updates: [] as Array<{ table: string; patch: any }>, dbNull: false, updateError: null as any },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => {
    if (store.dbNull) return null;
    return {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          update: (patch: any) => { store.updates.push({ table, patch }); return chain; },
          maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
          then: (resolve: any) => resolve({ data: null, error: store.updateError }),
        };
        return chain;
      },
    };
  },
}));

import { getSubscription, activateSubscriptionDemo, isSubscriptionActive, getWorkspaceBilling, PLACEHOLDER_PLAN } from "@/lib/services/billing/subscription";

beforeEach(() => {
  store.single = {};
  store.updates.length = 0;
  store.dbNull = false;
  store.updateError = null;
});

describe("isSubscriptionActive (pure)", () => {
  it("unknown (null) fails open", () => expect(isSubscriptionActive(null)).toBe(true));
  it("active with no expiry is active", () => expect(isSubscriptionActive({ status: "active", plan: null, expiresAt: null })).toBe(true));
  it("trialing with a future expiry is active", () => expect(isSubscriptionActive({ status: "trialing", plan: null, expiresAt: new Date(Date.now() + 8.64e7).toISOString() })).toBe(true));
  it("canceled is not active", () => expect(isSubscriptionActive({ status: "canceled", plan: null, expiresAt: null })).toBe(false));
  it("past_due is not active", () => expect(isSubscriptionActive({ status: "past_due", plan: null, expiresAt: null })).toBe(false));
  it("active but expired is not active", () => expect(isSubscriptionActive({ status: "active", plan: null, expiresAt: new Date(Date.now() - 8.64e7).toISOString() })).toBe(false));
});

describe("getSubscription", () => {
  it("maps the org row, defaulting a missing status to active", async () => {
    store.single["organizations"] = { subscription_status: "past_due", subscription_plan: "Pro", subscription_expires_at: null };
    expect(await getSubscription("org1")).toEqual({ status: "past_due", plan: "Pro", expiresAt: null });
  });
  it("returns null when the org isn't found", async () => {
    store.single["organizations"] = null;
    expect(await getSubscription("nope")).toBeNull();
  });
});

describe("activateSubscriptionDemo", () => {
  it("flips the subscription active with a future expiry and default plan", async () => {
    const sub = await activateSubscriptionDemo("org1");
    expect(sub?.status).toBe("active");
    expect(sub?.plan).toBe(PLACEHOLDER_PLAN);
    expect(new Date(sub!.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    expect(store.updates[0]).toMatchObject({ table: "organizations", patch: { subscription_status: "active", subscription_plan: PLACEHOLDER_PLAN } });
  });
  it("returns null on a write error", async () => {
    store.updateError = { message: "boom" };
    expect(await activateSubscriptionDemo("org1")).toBeNull();
  });
});

describe("getWorkspaceBilling", () => {
  it("resolves the org from the workspace and returns its subscription", async () => {
    store.single["workspaces"] = { organization_id: "org1" };
    store.single["organizations"] = { subscription_status: "active", subscription_plan: "Std", subscription_expires_at: null };
    expect(await getWorkspaceBilling("ws1")).toEqual({ organizationId: "org1", sub: { status: "active", plan: "Std", expiresAt: null } });
  });
  it("returns null for a standalone workspace with no organization", async () => {
    store.single["workspaces"] = { organization_id: null };
    expect(await getWorkspaceBilling("ws1")).toBeNull();
  });
});
