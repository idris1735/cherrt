import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Small filter-aware mock so the atomic conditional consume in verifyOtp is
// exercised for real (eq/is/gt/lt over an in-memory rows array).
const { store } = vi.hoisted(() => ({ store: { rows: [] as any[], idc: 0 } }));
vi.mock("@/lib/services/whatsapp", () => ({ sendTextMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => {
      const filters: Array<[string, string, any]> = [];
      let mode: string | null = null;
      let updateRow: any = null;
      const match = (r: any) =>
        filters.every(([op, col, val]) =>
          op === "eq" ? r[col] === val
          : op === "is" ? (val === null ? r[col] === null || r[col] === undefined : r[col] === val)
          : op === "gt" ? r[col] > val
          : op === "lt" ? r[col] < val
          : true);
      const apply = () => store.rows.filter(match);
      const builder: any = {
        insert: (row: any) => { store.rows.push({ id: `otp${++store.idc}`, consumed_at: null, attempts: 0, ...row }); return Promise.resolve({ error: null }); },
        delete: () => { mode = "delete"; return builder; },
        update: (row: any) => { mode = "update"; updateRow = row; return builder; },
        select: () => {
          if (mode === "update") { const m = apply(); m.forEach((r) => Object.assign(r, updateRow)); return Promise.resolve({ data: m.map((r) => ({ id: r.id })), error: null }); }
          mode = "select"; return builder;
        },
        eq: (c: string, v: any) => { filters.push(["eq", c, v]); return builder; },
        is: (c: string, v: any) => { filters.push(["is", c, v]); return builder; },
        gt: (c: string, v: any) => { filters.push(["gt", c, v]); return builder; },
        lt: (c: string, v: any) => { filters.push(["lt", c, v]); return builder; },
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: apply().slice(-1)[0] ?? null, error: null }),
        then: (resolve: any) => {
          if (mode === "delete") { const keep = store.rows.filter((r) => !match(r)); store.rows.length = 0; store.rows.push(...keep); }
          else if (mode === "update") { apply().forEach((r) => Object.assign(r, updateRow)); }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

import { sendOtp, verifyOtp } from "@/lib/services/identity/otp";
import { sendTextMessage } from "@/lib/services/whatsapp";

const codeFromSend = () => ((sendTextMessage as any).mock.calls.at(-1)[1] as string).match(/\b(\d{6})\b/)![1];

beforeEach(() => { store.rows.length = 0; store.idc = 0; });
afterEach(() => { vi.clearAllMocks(); });

describe("otp", () => {
  it("sends a 6-digit code over WhatsApp and verifies it once", async () => {
    expect(await sendOtp("234800", "migrate")).toBe(true);
    expect(await verifyOtp("234800", "migrate", codeFromSend())).toMatchObject({ ok: true });
  });

  it("rejects the wrong code and counts the attempt", async () => {
    await sendOtp("234800", "migrate");
    expect(await verifyOtp("234800", "migrate", "000000")).toMatchObject({ ok: false, reason: "wrong" });
    expect(store.rows[0].attempts).toBe(1);
  });

  it("is single-use: a correct code can't be replayed", async () => {
    await sendOtp("234800", "migrate");
    const code = codeFromSend();
    expect(await verifyOtp("234800", "migrate", code)).toMatchObject({ ok: true });
    expect(await verifyOtp("234800", "migrate", code)).toMatchObject({ ok: false });
  });
});
