import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { paystackConfigured, initializeGivingPayment, verifyPaystackSignature } from "@/lib/services/payments/paystack";

const KEY = "sk_test_abc123";

beforeEach(() => {
  process.env.PAYSTACK_SECRET_KEY = KEY;
});
afterEach(() => {
  delete process.env.PAYSTACK_SECRET_KEY;
  vi.restoreAllMocks();
});

describe("paystackConfigured", () => {
  it("reflects whether the secret key is set", () => {
    expect(paystackConfigured()).toBe(true);
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(paystackConfigured()).toBe(false);
  });
});

describe("initializeGivingPayment", () => {
  it("returns null when unconfigured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(await initializeGivingPayment({ amountNaira: 5000, email: "a@b.c", metadata: {} })).toBeNull();
  });

  it("posts amount in kobo and returns the authorization url + reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { authorization_url: "https://paystack.com/pay/xyz", reference: "ref_1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await initializeGivingPayment({ amountNaira: 5000, email: "giver@x.com", metadata: { workspace_id: "ws1" } });
    expect(out).toEqual({ authorizationUrl: "https://paystack.com/pay/xyz", reference: "ref_1" });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.amount).toBe(500000); // kobo
    expect(body.metadata).toMatchObject({ workspace_id: "ws1" });
  });

  it("returns null on a non-ok response or a failed status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await initializeGivingPayment({ amountNaira: 100, email: "a@b.c", metadata: {} })).toBeNull();
  });
});

describe("verifyPaystackSignature", () => {
  it("accepts a correct HMAC-SHA512 signature and rejects a wrong one", () => {
    const body = JSON.stringify({ event: "charge.success" });
    const good = createHmac("sha512", KEY).update(body).digest("hex");
    expect(verifyPaystackSignature(body, good)).toBe(true);
    expect(verifyPaystackSignature(body, "deadbeef")).toBe(false);
    expect(verifyPaystackSignature(body, null)).toBe(false);
  });

  it("rejects everything when unconfigured", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const body = "{}";
    const sig = createHmac("sha512", KEY).update(body).digest("hex");
    expect(verifyPaystackSignature(body, sig)).toBe(false);
  });
});
