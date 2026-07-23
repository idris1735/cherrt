import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/services/payments/paystack", () => ({
  paystackConfigured: vi.fn(),
  initializeGivingPayment: vi.fn(),
}));
const { store } = vi.hoisted(() => ({ store: { inserts: [] as any[] } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({ insert: (row: any) => { store.inserts.push({ table, row }); return Promise.resolve({ error: null }); } }),
  }),
}));

import { paystackConfigured, initializeGivingPayment } from "@/lib/services/payments/paystack";
import { PAYMENT_TOOLS } from "@/lib/services/agent/payment-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth", phone: "2348012345678", personId: "p1" };
const giveNow = PAYMENT_TOOLS.find((t) => t.name === "give_now")!;

beforeEach(() => {
  vi.clearAllMocks();
  store.inserts.length = 0;
});

describe("give_now", () => {
  it("falls back to a DEMO checkout link when Paystack isn't configured", async () => {
    vi.mocked(paystackConfigured).mockReturnValue(false);
    const out = (await giveNow.handler({ amount: 5000, givingType: "tithe" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/\/pay\/demo_/);
    expect(out.message).toMatch(/demo mode/i);
    expect(initializeGivingPayment).not.toHaveBeenCalled();
    // a pending demo payment is recorded with the giving details
    expect(store.inserts[0]).toMatchObject({ table: "demo_payments", row: { workspace_id: "ws1", amount: 5000, giving_type: "tithe", donor_person_id: "p1", status: "pending" } });
  });

  it("rejects a non-positive amount", async () => {
    vi.mocked(paystackConfigured).mockReturnValue(true);
    const out = (await giveNow.handler({ amount: 0 }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(initializeGivingPayment).not.toHaveBeenCalled();
  });

  it("initializes a payment with the right metadata and returns the link", async () => {
    vi.mocked(paystackConfigured).mockReturnValue(true);
    vi.mocked(initializeGivingPayment).mockResolvedValueOnce({ authorizationUrl: "https://pay/xyz", reference: "r1" });

    const out = (await giveNow.handler({ amount: 5000, givingType: "TITHE" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(out.message).toContain("https://pay/xyz");
    expect(out.message).toContain("₦5,000");

    const arg = vi.mocked(initializeGivingPayment).mock.calls[0][0];
    expect(arg.amountNaira).toBe(5000);
    expect(arg.metadata).toMatchObject({ workspace_id: "ws1", giving_type: "tithe", donor_name: "Ruth", donor_phone: "2348012345678" });
    expect(arg.email).toContain("2348012345678");
  });

  it("surfaces a failure to start the payment", async () => {
    vi.mocked(paystackConfigured).mockReturnValue(true);
    vi.mocked(initializeGivingPayment).mockResolvedValueOnce(null);
    const out = (await giveNow.handler({ amount: 5000 }, ctx)) as { error?: string };
    expect(out.error).toMatch(/try again/i);
  });
});
