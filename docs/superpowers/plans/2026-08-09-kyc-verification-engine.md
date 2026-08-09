# KYC Verification Engine — Implementation Plan (Slice 2, Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend engine for secure church onboarding — the Mono verification client, the `kyc_applications` data model + tokenized application service, trustee name-matching, and the check orchestration — fully testable, no UI yet.

**Architecture:** Pure service modules under `src/lib/services/kyc/` plus one migration. Mono is called server-side with the `mono-sec-key` header; results are written onto a `kyc_applications` row. Later plans add the web form (2), review dashboard (3), and tiered access + WhatsApp rewire (4).

**Tech Stack:** TypeScript, Next.js, Supabase (service-role), Vitest, Mono Lookup API. No new deps.

## Global Constraints

- Mono base URL: `https://api.withmono.com`. Secret from `process.env.MONO_SECRET_KEY`, sent as header `mono-sec-key`. The key prefix (`test_sk`/`live_sk`) selects sandbox vs live — same base URL. **Use a sandbox key for dev; live lookups cost ₦.**
- Mono responses may be wrapped (`{status,message,data}`) or bare — parse `json.data ?? json`.
- `kyc_applications` is NDPR-sensitive: RLS enabled deny-all (service-role only); ID numbers never stored in clear beyond last-4.
- Migration named `supabase/migrations/20260809130000_kyc_applications.sql` (distinct version; apply with `npx supabase db push`).
- Nigerian reality: a church's CAC `classification` is `IT` (Incorporated Trustees); the "directors" endpoint returns its **trustees**.

---

## Task 1: Mono Lookup client

**Files:**
- Create: `src/lib/services/kyc/mono.ts`
- Test: `src/lib/services/kyc/mono.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type MonoCompany = { id: string; approvedName: string; rcNumber: string; classification: string; active: boolean };
  export type MonoTrustee = { surname: string; firstname: string };
  export type MonoNin = { firstname: string; surname: string; middlename?: string; birthdate?: string; phone?: string; photoBase64?: string };
  export type MonoResult<T> = { ok: true; data: T } | { ok: false; error: string };
  export function monoCacLookup(search: string): Promise<MonoResult<MonoCompany[]>>;
  export function monoCacTrustees(companyId: string): Promise<MonoResult<MonoTrustee[]>>;
  export function monoNinLookup(nin: string): Promise<MonoResult<MonoNin>>;
  ```
  Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/kyc/mono.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { monoCacLookup, monoNinLookup, monoCacTrustees } from "@/lib/services/kyc/mono";

const origKey = process.env.MONO_SECRET_KEY;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.MONO_SECRET_KEY = "test_sk_abc";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); process.env.MONO_SECRET_KEY = origKey; });

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve("") } as Response);

describe("monoCacLookup", () => {
  it("GETs /v3/lookup/cac?search= with the sec key and maps companies", async () => {
    fetchMock.mockReturnValue(ok({ data: [{ id: "c1", approved_name: "GRACE CHAPEL", rc_number: "IT123", classification: "IT", active: true }] }));
    const res = await monoCacLookup("Grace Chapel");
    expect(res).toEqual({ ok: true, data: [{ id: "c1", approvedName: "GRACE CHAPEL", rcNumber: "IT123", classification: "IT", active: true }] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.withmono.com/v3/lookup/cac?search=Grace%20Chapel");
    expect((init.headers as Record<string, string>)["mono-sec-key"]).toBe("test_sk_abc");
  });

  it("returns an error result on a non-200", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve("unauthorized") } as Response);
    expect(await monoCacLookup("x")).toMatchObject({ ok: false });
  });
});

describe("monoNinLookup", () => {
  it("POSTs /v3/lookup/nin with the nin and maps the person + photo", async () => {
    fetchMock.mockReturnValue(ok({ data: { firstname: "Ada", surname: "Obi", birthdate: "01-01-1990", telephoneno: "234800", photo: "BASE64" } }));
    const res = await monoNinLookup("12345678901");
    expect(res).toEqual({ ok: true, data: { firstname: "Ada", surname: "Obi", middlename: undefined, birthdate: "01-01-1990", phone: "234800", photoBase64: "BASE64" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.withmono.com/v3/lookup/nin");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ nin: "12345678901" });
  });
});

describe("monoCacTrustees", () => {
  it("GETs the directors endpoint and maps names", async () => {
    fetchMock.mockReturnValue(ok({ data: [{ surname: "Obi", firstname: "Ada" }] }));
    expect(await monoCacTrustees("c1")).toEqual({ ok: true, data: [{ surname: "Obi", firstname: "Ada" }] });
    expect((fetchMock.mock.calls[0][0] as string)).toBe("https://api.withmono.com/v3/lookup/cac/company/c1/directors");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/mono.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/kyc/mono.ts`:
```typescript
// Mono Lookup API client (CAC / NIN). Server-side only. The mono-sec-key's
// prefix (test_sk/live_sk) selects sandbox vs live — same base URL.
// Docs: https://docs.mono.co/docs/lookup/cac-lookup , /nin-lookup
const BASE = "https://api.withmono.com";

export type MonoCompany = { id: string; approvedName: string; rcNumber: string; classification: string; active: boolean };
export type MonoTrustee = { surname: string; firstname: string };
export type MonoNin = { firstname: string; surname: string; middlename?: string; birthdate?: string; phone?: string; photoBase64?: string };
export type MonoResult<T> = { ok: true; data: T } | { ok: false; error: string };

function key(): string { return process.env.MONO_SECRET_KEY ?? ""; }
function headers(): Record<string, string> { return { "mono-sec-key": key(), "Content-Type": "application/json" }; }
function unwrap(json: unknown): unknown { return (json as { data?: unknown })?.data ?? json; }

async function call<T>(url: string, init: RequestInit, map: (raw: unknown) => T): Promise<MonoResult<T>> {
  if (!key()) return { ok: false, error: "Mono key not configured" };
  try {
    const res = await fetch(url, init);
    if (!res.ok) return { ok: false, error: `Mono ${res.status}: ${await res.text()}` };
    return { ok: true, data: map(unwrap(await res.json())) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mono request failed" };
  }
}

export function monoCacLookup(search: string): Promise<MonoResult<MonoCompany[]>> {
  return call(`${BASE}/v3/lookup/cac?search=${encodeURIComponent(search)}`, { method: "GET", headers: headers() }, (raw) =>
    ((raw as any[]) ?? []).map((c: any) => ({ id: String(c.id ?? ""), approvedName: c.approved_name ?? "", rcNumber: c.rc_number ?? "", classification: c.classification ?? "", active: !!c.active })),
  );
}

export function monoCacTrustees(companyId: string): Promise<MonoResult<MonoTrustee[]>> {
  return call(`${BASE}/v3/lookup/cac/company/${encodeURIComponent(companyId)}/directors`, { method: "GET", headers: headers() }, (raw) =>
    ((raw as any[]) ?? []).map((d: any) => ({ surname: d.surname ?? "", firstname: d.firstname ?? "" })),
  );
}

export function monoNinLookup(nin: string): Promise<MonoResult<MonoNin>> {
  return call(`${BASE}/v3/lookup/nin`, { method: "POST", headers: headers(), body: JSON.stringify({ nin }) }, (raw) => {
    const d = raw as any;
    return { firstname: d.firstname ?? "", surname: d.surname ?? "", middlename: d.middlename ?? undefined, birthdate: d.birthdate ?? undefined, phone: d.telephoneno ?? undefined, photoBase64: d.photo ?? undefined };
  });
}
```
(`any` is deliberate at the JSON boundary; add `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top if the project's lint blocks it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/mono.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/kyc/mono.ts src/lib/services/kyc/mono.test.ts
git commit -m "feat: Mono lookup client (CAC + trustees + NIN)"
```

---

## Task 2: `kyc_applications` data model

**Files:**
- Create: `supabase/migrations/20260809130000_kyc_applications.sql`

**Interfaces:**
- Produces the `kyc_applications` table consumed by Tasks 3 and 5.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260809130000_kyc_applications.sql`:
```sql
create table if not exists public.kyc_applications (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  token_expires_at timestamptz not null,
  applicant_phone text not null,
  church_legal_name text,
  it_number text,
  address text,
  denomination text,
  size text,
  applicant_role text,
  id_type text check (id_type in ('nin', 'bvn')),
  id_last4 text,
  email text,
  email_verified_at timestamptz,
  selfie_path text,
  cac_cert_path text,
  consent_at timestamptz,
  cac_result jsonb,
  id_result jsonb,
  trustee_match text check (trustee_match in ('match', 'no_match', 'unknown')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  reject_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists kyc_applications_status_idx on public.kyc_applications (status);
-- NDPR: service-role only. Enable RLS with no policies (deny all others).
alter table public.kyc_applications enable row level security;
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db push`
Expected: applies `20260809130000_kyc_applications.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260809130000_kyc_applications.sql
git commit -m "feat: kyc_applications table (RLS deny-all)"
```

---

## Task 3: Application + token service

**Files:**
- Create: `src/lib/services/kyc/applications.ts`
- Test: `src/lib/services/kyc/applications.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient`.
- Produces:
  ```typescript
  export type KycApplication = { id: string; status: string; token: string; applicantPhone: string; /* + raw fields */ [k: string]: unknown };
  export function startApplication(phone: string): Promise<{ token: string } | null>;   // creates a draft, 24h token
  export function resolveByToken(token: string): Promise<KycApplication | null>;         // valid draft, not expired
  export function updateApplication(id: string, patch: Record<string, unknown>): Promise<boolean>;
  ```
  Consumed by Tasks 5 (orchestration) and Plan 2 (web form).

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/kyc/applications.test.ts`:
```typescript
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
        gt: (c: string, v: any) => { f.push([c, v]); return b; }, // token_expires_at > now (string compare ok for ISO)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/applications.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/kyc/applications.ts`:
```typescript
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type KycApplication = { id: string; status: string; token: string; applicantPhone: string; [k: string]: unknown };
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function startApplication(phone: string): Promise<{ token: string } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const token = randomBytes(24).toString("base64url");
  const { error } = await db.from("kyc_applications").insert({
    token, token_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    applicant_phone: phone, status: "draft",
  }).select("id").single();
  return error ? null : { token };
}

export async function resolveByToken(token: string): Promise<KycApplication | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await db
    .from("kyc_applications")
    .select("*")
    .eq("token", token)
    .eq("status", "draft")
    .gt("token_expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  const r = data as any;
  return { ...r, applicantPhone: r.applicant_phone };
}

export async function updateApplication(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await db.from("kyc_applications").update(patch).eq("id", id);
  return !error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/applications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/kyc/applications.ts src/lib/services/kyc/applications.test.ts
git commit -m "feat: KYC application + tokenized draft service"
```

---

## Task 4: Trustee name-match

**Files:**
- Create: `src/lib/services/kyc/trustee-match.ts`
- Test: `src/lib/services/kyc/trustee-match.test.ts`

**Interfaces:**
- Consumes: `MonoTrustee` (Task 1).
- Produces: `export function matchTrustee(applicantName: string, trustees: MonoTrustee[]): "match" | "no_match" | "unknown";` — `unknown` when the trustee list is empty (Mono couldn't return it). Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/kyc/trustee-match.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { matchTrustee } from "@/lib/services/kyc/trustee-match";

describe("matchTrustee", () => {
  const trustees = [{ surname: "Obi", firstname: "Ada" }, { surname: "Bello", firstname: "Daniel" }];
  it("matches on both names in any order/case", () => {
    expect(matchTrustee("Ada Obi", trustees)).toBe("match");
    expect(matchTrustee("obi ada grace", trustees)).toBe("match");
  });
  it("no_match when the name isn't a trustee", () => {
    expect(matchTrustee("Samuel Eze", trustees)).toBe("no_match");
  });
  it("unknown when there are no trustees to compare", () => {
    expect(matchTrustee("Ada Obi", [])).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/trustee-match.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/kyc/trustee-match.ts`:
```typescript
import type { MonoTrustee } from "@/lib/services/kyc/mono";

// A trustee matches when BOTH their surname and firstname appear in the
// applicant's stated name (case-insensitive, order-independent). Empty trustee
// list → unknown (Mono couldn't confirm), so the reviewer decides.
export function matchTrustee(applicantName: string, trustees: MonoTrustee[]): "match" | "no_match" | "unknown" {
  if (!trustees.length) return "unknown";
  const words = new Set(applicantName.toLowerCase().split(/\s+/).filter(Boolean));
  const hit = trustees.some((t) => words.has(t.surname.toLowerCase()) && words.has(t.firstname.toLowerCase()));
  return hit ? "match" : "no_match";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/trustee-match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/kyc/trustee-match.ts src/lib/services/kyc/trustee-match.test.ts
git commit -m "feat: trustee name-match (anti-hijack check)"
```

---

## Task 5: `runKycChecks` orchestration

**Files:**
- Modify: `src/lib/services/kyc/applications.ts`
- Test: `src/lib/services/kyc/checks.test.ts`

**Interfaces:**
- Consumes: `monoCacLookup`, `monoCacTrustees`, `monoNinLookup` (Task 1); `matchTrustee` (Task 4); `updateApplication` (Task 3).
- Produces: `export function runKycChecks(app: { id: string; itNumber: string; churchLegalName: string; idType: "nin"|"bvn"; idNumber: string; applicantRole?: string }): Promise<{ cac: boolean; id: boolean; trustee: "match"|"no_match"|"unknown" }>` — runs the lookups, writes `cac_result` / `id_result` / `trustee_match` (+ `id_last4`) onto the application, returns a summary. Consumed by Plan 2's submit route.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/kyc/checks.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/kyc/mono", () => ({
  monoCacLookup: vi.fn(),
  monoCacTrustees: vi.fn(),
  monoNinLookup: vi.fn(),
}));
const patches: any[] = [];
vi.mock("@/lib/services/kyc/applications", async (orig) => {
  const actual = await orig<typeof import("@/lib/services/kyc/applications")>();
  return { ...actual, updateApplication: vi.fn(async (_id: string, p: any) => { patches.push(p); return true; }) };
});

import { runKycChecks } from "@/lib/services/kyc/applications";
import { monoCacLookup, monoCacTrustees, monoNinLookup } from "@/lib/services/kyc/mono";

beforeEach(() => { patches.length = 0; vi.clearAllMocks(); });

describe("runKycChecks", () => {
  it("runs CAC + NIN + trustee match and records results", async () => {
    (monoCacLookup as any).mockResolvedValue({ ok: true, data: [{ id: "c1", approvedName: "GRACE CHAPEL", rcNumber: "IT1", classification: "IT", active: true }] });
    (monoCacTrustees as any).mockResolvedValue({ ok: true, data: [{ surname: "Obi", firstname: "Ada" }] });
    (monoNinLookup as any).mockResolvedValue({ ok: true, data: { firstname: "Ada", surname: "Obi", birthdate: "01-01-1990", photoBase64: "IMG" } });

    const out = await runKycChecks({ id: "k1", itNumber: "IT1", churchLegalName: "Grace Chapel", idType: "nin", idNumber: "12345678901", applicantRole: "Ada Obi" });
    expect(out).toEqual({ cac: true, id: true, trustee: "match" });
    const merged = Object.assign({}, ...patches);
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/checks.test.ts`
Expected: FAIL — `runKycChecks` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/services/kyc/applications.ts`:
```typescript
import { monoCacLookup, monoCacTrustees, monoNinLookup } from "@/lib/services/kyc/mono";
import { matchTrustee } from "@/lib/services/kyc/trustee-match";

export async function runKycChecks(app: {
  id: string; itNumber: string; churchLegalName: string; idType: "nin" | "bvn"; idNumber: string; applicantRole?: string;
}): Promise<{ cac: boolean; id: boolean; trustee: "match" | "no_match" | "unknown" }> {
  const patch: Record<string, unknown> = { id_last4: app.idNumber.slice(-4) };

  // CAC: look up the IT number, prefer an exact-ish name/rc match.
  const cacRes = await monoCacLookup(app.itNumber || app.churchLegalName);
  const company = cacRes.ok
    ? cacRes.data.find((c) => c.rcNumber && app.itNumber && c.rcNumber.replace(/\W/g, "") === app.itNumber.replace(/\W/g, "")) ?? cacRes.data[0]
    : undefined;
  const cacOk = !!company && company.active;
  patch.cac_result = cacRes.ok ? { company, count: cacRes.data.length } : { error: cacRes.error };

  // Trustees (only if we found a company).
  let trustee: "match" | "no_match" | "unknown" = "unknown";
  if (company) {
    const tRes = await monoCacTrustees(company.id);
    trustee = tRes.ok ? matchTrustee(app.applicantRole ?? "", tRes.data) : "unknown";
  }
  patch.trustee_match = trustee;

  // ID (NIN today; BVN wired the same way in a later task).
  const idRes = app.idType === "nin" ? await monoNinLookup(app.idNumber) : { ok: false as const, error: "BVN not yet wired" };
  patch.id_result = idRes.ok ? idRes.data : { error: idRes.error };

  await updateApplication(app.id, patch);
  return { cac: cacOk, id: idRes.ok, trustee };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/checks.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/kyc/applications.ts src/lib/services/kyc/checks.test.ts
git commit -m "feat: runKycChecks — orchestrate CAC + NIN + trustee match onto the application"
```

---

## Self-Review Notes

**Spec coverage (this plan = the verification engine):** Mono client (CAC/trustees/NIN) → Task 1; `kyc_applications` + RLS → Task 2; tokenized application service → Task 3; trustee anti-hijack match → Task 4; check orchestration writing results → Task 5. Web form/submit (Plan 2), review dashboard/approval (Plan 3), tiered access + WhatsApp rewire (Plan 4), and email OTP delivery (Plan 2) are out of scope here, by decomposition.

**Placeholder scan:** none — every step has real code. BVN is explicitly stubbed in Task 5 (`"BVN not yet wired"`) and called out as a later task, not a silent gap.

**Type consistency:** `MonoResult<T>` / `MonoCompany` / `MonoTrustee` / `MonoNin` (Task 1) are consumed unchanged in Tasks 4–5. `matchTrustee` returns the same `"match"|"no_match"|"unknown"` union used by `runKycChecks` and the `kyc_applications.trustee_match` check constraint (Task 2). `startApplication`/`resolveByToken`/`updateApplication` (Task 3) signatures match their use in Task 5.
