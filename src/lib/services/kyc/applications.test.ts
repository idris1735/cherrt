import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { rows: [] as any[], idc: 0 } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => {
      const f: Array<[string, any]> = [];
      let mode: string | null = null; let patch: any = null;
      const match = (r: any) => f.every(([c, v]) => r[c] === v);
      const b: any = {
        insert: (row: any) => { const rec = { id: `k${++store.idc}`, ...row }; store.rows.push(rec); return { select: () => ({ single: () => Promise.resolve({ data: rec, error: null }) }) }; },
        select: () => b, update: (p: any) => { mode = "update"; patch = p; return b; },
        eq: (c: string, v: any) => { f.push([c, v]); return b; },
        gt: () => b,
        maybeSingle: () => Promise.resolve({ data: store.rows.filter(match).slice(-1)[0] ?? null, error: null }),
        then: (res: any) => { if (mode === "update") store.rows.filter(match).forEach((r) => Object.assign(r, patch)); return res({ error: null }); },
      };
      return b;
    },
  }),
}));

import { startApplication, resolveByToken, updateApplication } from "@/lib/services/kyc/applications";

beforeEach(() => { store.rows.length = 0; store.idc = 0; });

describe("kyc applications", () => {
  it("startApplication creates a draft with a token", async () => {
    const out = await startApplication("234800");
    expect(out?.token).toBeTruthy();
    expect(store.rows[0]).toMatchObject({ applicant_phone: "234800", status: "draft" });
  });

  it("resolveByToken returns the draft, updateApplication patches it", async () => {
    const { token } = (await startApplication("234800"))!;
    const app = await resolveByToken(token);
    expect(app?.applicantPhone).toBe("234800");
    expect(await updateApplication(app!.id, { church_legal_name: "Grace" })).toBe(true);
    expect(store.rows[0].church_legal_name).toBe("Grace");
  });
});
