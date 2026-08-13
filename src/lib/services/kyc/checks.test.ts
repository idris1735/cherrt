import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { patches: [] as any[] } }));
vi.mock("@/lib/services/kyc/mono", () => ({
  monoCacLookup: vi.fn(),
  monoCacTrustees: vi.fn(),
  monoNinLookup: vi.fn(),
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({ update: (p: any) => ({ eq: () => { store.patches.push(p); return Promise.resolve({ error: null }); } }) }),
  }),
}));

import { runKycChecks } from "@/lib/services/kyc/applications";
import { monoCacLookup, monoCacTrustees, monoNinLookup } from "@/lib/services/kyc/mono";

beforeEach(() => { store.patches.length = 0; vi.clearAllMocks(); });

describe("runKycChecks", () => {
  it("runs CAC + NIN + trustee match and records results", async () => {
    (monoCacLookup as any).mockResolvedValue({ ok: true, data: [{ id: "c1", approvedName: "GRACE CHAPEL", rcNumber: "IT1", classification: "IT", active: true }] });
    (monoCacTrustees as any).mockResolvedValue({ ok: true, data: [{ surname: "Obi", firstname: "Ada" }] });
    (monoNinLookup as any).mockResolvedValue({ ok: true, data: { firstname: "Ada", surname: "Obi", birthdate: "01-01-1990", photoBase64: "IMG" } });

    const out = await runKycChecks({ id: "k1", itNumber: "IT1", churchLegalName: "Grace Chapel", idType: "nin", idNumber: "12345678901", applicantRole: "Ada Obi" });
    expect(out).toEqual({ cac: true, id: true, trustee: "match" });
    const merged = Object.assign({}, ...store.patches);
    expect(merged.trustee_match).toBe("match");
    expect(merged.id_last4).toBe("8901");
    expect(merged.cac_result).toBeTruthy();
    expect(merged.id_result).toBeTruthy();
  });

  it("marks cac false when Mono finds nothing", async () => {
    (monoCacLookup as any).mockResolvedValue({ ok: true, data: [] });
    (monoNinLookup as any).mockResolvedValue({ ok: false, error: "x" });
    const out = await runKycChecks({ id: "k1", itNumber: "NOPE", churchLegalName: "X", idType: "nin", idNumber: "1", applicantRole: "" });
    expect(out.cac).toBe(false);
    expect(out.id).toBe(false);
  });

  it("P0-3: never rejects when Mono THROWS — records errored results instead", async () => {
    (monoCacLookup as any).mockRejectedValue(new Error("mono down"));
    (monoNinLookup as any).mockRejectedValue(new Error("mono down"));
    const out = await runKycChecks({ id: "k1", itNumber: "IT1", churchLegalName: "Grace Chapel", idType: "nin", idNumber: "12345678901", applicantRole: "Ada Obi" });
    // resolves (doesn't throw) with neutral results
    expect(out).toEqual({ cac: false, id: false, trustee: "unknown" });
    const merged = Object.assign({}, ...store.patches);
    expect(merged.cac_result).toMatchObject({ error: expect.stringContaining("manually") });
    expect(merged.id_result).toMatchObject({ error: expect.stringContaining("manually") });
  });
});
