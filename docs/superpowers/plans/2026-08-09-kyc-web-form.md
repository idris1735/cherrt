# KYC Web Form + Submit — Implementation Plan (Slice 2, Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The applicant-facing half: a secure `/onboard/[token]` web form (church + IT number + NIN/BVN + email + "selfie holding your ID" + consent), email verification via Resend, private selfie storage, and a submit route that runs `runKycChecks` and queues the application `pending`.

**Architecture:** Reuses the Plan-1 engine (`kyc/applications.ts`, `runKycChecks`). Adds a Resend email-OTP path (reusing `otp_challenges`), a private Supabase Storage bucket, a Next.js server page + client form, and two route handlers. The WhatsApp "set up my church" rewire and the review dashboard are Plans 4 and 3.

**Tech Stack:** Next.js 16 (App Router, route handlers, async params/searchParams), TypeScript, Supabase (service-role storage), Resend, Vitest.

## Global Constraints

- Email OTP reuses `otp_challenges` with `purpose='email'` and `phone_number` holding the email; delivery via **Resend** (`RESEND_API_KEY`, from `RESEND_FROM` ?? `Chertt <onboarding@resend.dev>`).
- Selfies/CAC docs go in a **private** Storage bucket `kyc`; read only via short-lived **signed URLs** (never public).
- Mono is called through the Plan-1 engine only; use the **sandbox** key in dev.
- New migrations use distinct versions under `20260809…`.

---

## Task 1: Email OTP via Resend

**Files:**
- Modify: `package.json` (add `resend`), `src/lib/services/identity/otp.ts` (extend `Purpose`)
- Create: `supabase/migrations/20260809140000_otp_email_purpose.sql`, `src/lib/services/kyc/email-otp.ts`
- Test: `src/lib/services/kyc/email-otp.test.ts`

**Interfaces:**
- Consumes: `verifyOtp` (identity/otp.ts).
- Produces: `sendEmailOtp(email: string): Promise<boolean>`, `verifyEmailOtp(email: string, code: string): Promise<boolean>`.

- [ ] **Step 1: Install Resend + widen the OTP purpose**

```bash
npm install resend
```
In `src/lib/services/identity/otp.ts`, change `type Purpose = "migrate" | "step_up";` to `type Purpose = "migrate" | "step_up" | "email";`

Create `supabase/migrations/20260809140000_otp_email_purpose.sql`:
```sql
alter table public.otp_challenges drop constraint if exists otp_challenges_purpose_check;
alter table public.otp_challenges add constraint otp_challenges_purpose_check
  check (purpose in ('migrate', 'step_up', 'email'));
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/services/kyc/email-otp.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
vi.mock("resend", () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }));
const { store } = vi.hoisted(() => ({ store: { rows: [] as any[] } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: (row: any) => { store.rows.push({ ...row }); return Promise.resolve({ error: null }); },
    }),
  }),
}));

import { sendEmailOtp } from "@/lib/services/kyc/email-otp";

beforeEach(() => { store.rows.length = 0; sendMock.mockClear(); process.env.RESEND_API_KEY = "re_test"; });

describe("sendEmailOtp", () => {
  it("stores an email OTP and sends it via Resend", async () => {
    const ok = await sendEmailOtp("pastor@grace.org");
    expect(ok).toBe(true);
    expect(store.rows[0]).toMatchObject({ phone_number: "pastor@grace.org", purpose: "email" });
    expect(sendMock).toHaveBeenCalledOnce();
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe("pastor@grace.org");
    expect(arg.html).toMatch(/\d{6}/);
  });

  it("still returns true (code stored) if email delivery throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("resend down"));
    expect(await sendEmailOtp("x@y.z")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/email-otp.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `src/lib/services/kyc/email-otp.ts`:
```typescript
import { createHash, randomInt } from "node:crypto";
import { Resend } from "resend";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { verifyOtp } from "@/lib/services/identity/otp";

function hash(code: string): string {
  return createHash("sha256").update(code + (process.env.OTP_PEPPER ?? "chertt-otp")).digest("hex");
}

// Sends a 6-digit code to an email (Resend), stored in otp_challenges with
// purpose 'email' (phone_number column holds the email). Mirrors sendOtp but
// over email instead of WhatsApp. Delivery failure is non-fatal (a resend retries).
export async function sendEmailOtp(email: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("otp_challenges").delete().eq("phone_number", email).eq("purpose", "email");
  const { error } = await db.from("otp_challenges").insert({
    phone_number: email, purpose: "email", code_hash: hash(code),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) return false;
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      await new Resend(apiKey).emails.send({
        from: process.env.RESEND_FROM ?? "Chertt <onboarding@resend.dev>",
        to: email,
        subject: "Your Chertt verification code",
        html: `<p>Your Chertt code is <b>${code}</b>. It expires in 10 minutes. Never share it.</p>`,
      });
    } catch { /* code is stored; caller can resend */ }
  }
  return true;
}

export function verifyEmailOtp(email: string, code: string): Promise<boolean> {
  return verifyOtp(email, "email", code).then((r) => r.ok);
}
```

- [ ] **Step 5: Apply migration, run tests**

Run: `npx supabase db push`
Run: `npx vitest run src/lib/services/kyc/email-otp.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/services/identity/otp.ts src/lib/services/kyc/email-otp.ts src/lib/services/kyc/email-otp.test.ts supabase/migrations/20260809140000_otp_email_purpose.sql
git commit -m "feat: email OTP via Resend (reuses otp_challenges, purpose=email)"
```

---

## Task 2: Private KYC storage

**Files:**
- Create: `supabase/migrations/20260809150000_kyc_bucket.sql`, `src/lib/services/kyc/storage.ts`
- Test: `src/lib/services/kyc/storage.test.ts`

**Interfaces:**
- Produces: `uploadKycFile(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>`, `signedKycUrl(path: string): Promise<string | null>` (60-min signed URL). Consumed by Task 4 and Plan 3.

- [ ] **Step 1: Write the migration (private bucket)**

Create `supabase/migrations/20260809150000_kyc_bucket.sql`:
```sql
-- Private bucket for KYC selfies/documents. No public access; read via signed URLs.
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/services/kyc/storage.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadMock = vi.fn().mockResolvedValue({ error: null });
const signMock = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed/x" }, error: null });
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({ storage: { from: () => ({ upload: uploadMock, createSignedUrl: signMock }) } }),
}));

import { uploadKycFile, signedKycUrl } from "@/lib/services/kyc/storage";

beforeEach(() => { uploadMock.mockClear(); signMock.mockClear(); });

describe("kyc storage", () => {
  it("uploads bytes to the kyc bucket", async () => {
    const ok = await uploadKycFile("app1/selfie.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(ok).toBe(true);
    expect(uploadMock).toHaveBeenCalledWith("app1/selfie.jpg", expect.anything(), expect.objectContaining({ contentType: "image/jpeg" }));
  });
  it("returns a signed URL", async () => {
    expect(await signedKycUrl("app1/selfie.jpg")).toBe("https://signed/x");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/storage.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `src/lib/services/kyc/storage.ts`:
```typescript
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

/* eslint-disable @typescript-eslint/no-explicit-any */
const BUCKET = "kyc";

export async function uploadKycFile(path: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const { error } = await (db as any).storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  return !error;
}

export async function signedKycUrl(path: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await (db as any).storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
```

- [ ] **Step 5: Apply migration + run tests**

Run: `npx supabase db push`
Run: `npx vitest run src/lib/services/kyc/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260809150000_kyc_bucket.sql src/lib/services/kyc/storage.ts src/lib/services/kyc/storage.test.ts
git commit -m "feat: private kyc storage bucket + upload/signed-url helpers"
```

---

## Task 3: Onboard page + client form + email-code route

**Files:**
- Create: `src/app/onboard/[token]/page.tsx`, `src/app/onboard/[token]/onboard-form.tsx`, `src/app/api/onboard/email-code/route.ts`

**Interfaces:**
- Consumes: `resolveByToken` (Plan 1), `sendEmailOtp` (Task 1).
- Produces: the applicant UI + a `POST /api/onboard/email-code` (`{token, email}` → sends the code).

- [ ] **Step 1: Email-code route**

Create `src/app/api/onboard/email-code/route.ts`:
```typescript
import { resolveByToken } from "@/lib/services/kyc/applications";
import { sendEmailOtp } from "@/lib/services/kyc/email-otp";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const { token, email } = (await req.json().catch(() => ({}))) as { token?: string; email?: string };
  if (!token || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  const app = await resolveByToken(token);
  if (!app) return Response.json({ ok: false, error: "This link is invalid or has expired." }, { status: 404 });
  const sent = await sendEmailOtp(email);
  return Response.json({ ok: sent });
}
```

- [ ] **Step 2: Server page (resolves the token)**

Create `src/app/onboard/[token]/page.tsx`:
```tsx
import { resolveByToken } from "@/lib/services/kyc/applications";
import { OnboardForm } from "./onboard-form";

export const dynamic = "force-dynamic";

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await resolveByToken(token);
  if (!app) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", background: "#0e1512", color: "#e8efe9", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <h2>This link is invalid or expired</h2>
          <p style={{ color: "#9baba0" }}>Ask Chertt on WhatsApp to set up your church again to get a fresh link.</p>
        </div>
      </div>
    );
  }
  return <OnboardForm token={token} />;
}
```

- [ ] **Step 3: Client form**

Create `src/app/onboard/[token]/onboard-form.tsx`:
```tsx
"use client";
import { useState } from "react";

export function OnboardForm({ token }: { token: string }) {
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  async function sendCode() {
    setBusy(true); setError("");
    const res = await fetch("/api/onboard/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, email }) });
    const j = await res.json();
    setBusy(false);
    if (j.ok) setEmailSent(true); else setError(j.error ?? "Couldn't send the code.");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    fd.set("token", token);
    const res = await fetch("/api/onboard/submit", { method: "POST", body: fd });
    const j = await res.json();
    setBusy(false);
    if (j.ok) setDone(true); else setError(j.error ?? "Something went wrong.");
  }

  if (done) return <Shell><h2>Submitted 🙏</h2><p style={p}>Your church is under review. Chertt will message you on WhatsApp once it's approved.</p></Shell>;

  return (
    <Shell>
      <h2 style={{ marginBottom: 4 }}>Set up your church</h2>
      <p style={p}>We verify every church to keep giving and members safe. This takes a few minutes.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <Field name="church_legal_name" label="Church legal name (as on CAC)" required />
        <Field name="it_number" label="CAC Incorporated-Trustees (IT/RC) number" required />
        <Field name="address" label="Church address" required />
        <Field name="applicant_role" label="Your full name & role (e.g. 'Ada Obi, Trustee')" required />
        <label style={lbl}>ID type
          <select name="id_type" style={inp} defaultValue="nin"><option value="nin">NIN</option><option value="bvn">BVN</option></select>
        </label>
        <Field name="id_number" label="NIN / BVN number" required />
        <label style={lbl}>Email
          <div style={{ display: "flex", gap: 8 }}>
            <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inp, flex: 1 }} />
            <button type="button" onClick={sendCode} disabled={busy || !email} style={btnGhost}>Send code</button>
          </div>
        </label>
        {emailSent && <Field name="email_code" label="6-digit code from your email" required />}
        <label style={lbl}>Selfie holding your ID
          <input name="selfie" type="file" accept="image/*" capture="user" required style={inp} />
        </label>
        <label style={{ ...lbl, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <input name="consent" type="checkbox" required />
          <span style={{ fontSize: 13, color: "#9baba0" }}>I consent to Chertt verifying my identity and my church's registration (NDPR).</span>
        </label>
        {error && <p style={{ color: "#ff6b6b", fontSize: 14 }}>{error}</p>}
        <button type="submit" disabled={busy} style={btn}>{busy ? "Working…" : "Submit for review"}</button>
      </form>
    </Shell>
  );
}

const p = { color: "#9baba0", fontSize: 14 } as const;
const lbl = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: "#c7d2cb" };
const inp = { padding: "10px 12px", borderRadius: 10, border: "1px solid #26332b", background: "#141d18", color: "#e8efe9", fontSize: 15 } as const;
const btn = { padding: "13px", border: "none", borderRadius: 12, background: "#0b3d2e", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" } as const;
const btnGhost = { padding: "0 14px", border: "1px solid #2e7d5b", borderRadius: 10, background: "transparent", color: "#7fd4a8", fontWeight: 700, cursor: "pointer" } as const;
function Field({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <label style={lbl}>{label}<input name={name} required={required} style={inp} /></label>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#0e1512", color: "#e8efe9", fontFamily: "system-ui", padding: 24, display: "flex", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: 440 }}>{children}</div></div>;
}
```

- [ ] **Step 3b: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no errors. (Build check happens in Task 4's suite run.)

- [ ] **Step 4: Commit**

```bash
git add src/app/onboard src/app/api/onboard/email-code
git commit -m "feat: onboard KYC form + page + email-code route"
```

---

## Task 4: Submit route

**Files:**
- Create: `src/app/api/onboard/submit/route.ts`
- Test: `src/app/api/onboard/submit/route.test.ts`

**Interfaces:**
- Consumes: `resolveByToken`, `updateApplication`, `runKycChecks` (Plan 1); `verifyEmailOtp` (Task 1); `uploadKycFile` (Task 2).
- Produces: `POST /api/onboard/submit` — validates token + consent + email code, stores the selfie, records fields, runs checks, sets `pending`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/onboard/submit/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/kyc/applications", () => ({
  resolveByToken: vi.fn(),
  updateApplication: vi.fn().mockResolvedValue(true),
  runKycChecks: vi.fn().mockResolvedValue({ cac: true, id: true, trustee: "match" }),
}));
vi.mock("@/lib/services/kyc/email-otp", () => ({ verifyEmailOtp: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/services/kyc/storage", () => ({ uploadKycFile: vi.fn().mockResolvedValue(true) }));

import { POST } from "@/app/api/onboard/submit/route";
import { resolveByToken, updateApplication, runKycChecks } from "@/lib/services/kyc/applications";
import { verifyEmailOtp } from "@/lib/services/kyc/email-otp";

function form(fields: Record<string, string>, withFile = true): Request {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
  if (withFile) fd.set("selfie", new File([new Uint8Array([1, 2, 3])], "s.jpg", { type: "image/jpeg" }));
  return new Request("https://x/api/onboard/submit", { method: "POST", body: fd });
}
const base = { token: "t", church_legal_name: "Grace", it_number: "IT1", address: "Lagos", applicant_role: "Ada Obi", id_type: "nin", id_number: "12345678901", email: "a@b.co", email_code: "123456", consent: "on" };

beforeEach(() => { vi.clearAllMocks(); (resolveByToken as any).mockResolvedValue({ id: "k1", applicantPhone: "234800" }); });

describe("POST /api/onboard/submit", () => {
  it("verifies + stores + runs checks + sets pending on a good submission", async () => {
    const res = await POST(form(base));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(runKycChecks).toHaveBeenCalled();
    expect(updateApplication).toHaveBeenCalledWith("k1", expect.objectContaining({ status: "pending" }));
  });

  it("rejects a bad token", async () => {
    (resolveByToken as any).mockResolvedValue(null);
    expect((await POST(form(base))).status).toBe(404);
  });

  it("rejects a wrong email code", async () => {
    (verifyEmailOtp as any).mockResolvedValue(false);
    expect((await POST(form(base))).status).toBe(400);
  });

  it("rejects missing consent", async () => {
    const { consent, ...noConsent } = base;
    expect((await POST(form(noConsent))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/onboard/submit/route.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement**

Create `src/app/api/onboard/submit/route.ts`:
```typescript
import { resolveByToken, updateApplication, runKycChecks } from "@/lib/services/kyc/applications";
import { verifyEmailOtp } from "@/lib/services/kyc/email-otp";
import { uploadKycFile } from "@/lib/services/kyc/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ ok: false, error: "Bad form data." }, { status: 400 });
  const s = (k: string) => String(fd.get(k) ?? "").trim();

  const token = s("token");
  const app = token ? await resolveByToken(token) : null;
  if (!app) return Response.json({ ok: false, error: "This link is invalid or expired." }, { status: 404 });

  if (s("consent") !== "on") return Response.json({ ok: false, error: "Consent is required." }, { status: 400 });
  const email = s("email");
  if (!(await verifyEmailOtp(email, s("email_code")))) {
    return Response.json({ ok: false, error: "That email code is wrong or expired." }, { status: 400 });
  }

  const idType = s("id_type") === "bvn" ? "bvn" : "nin";
  const idNumber = s("id_number");

  // Store the selfie privately.
  const selfie = fd.get("selfie");
  let selfiePath: string | undefined;
  if (selfie instanceof File && selfie.size > 0) {
    selfiePath = `${app.id}/selfie-${Date.now()}.jpg`;
    await uploadKycFile(selfiePath, new Uint8Array(await selfie.arrayBuffer()), selfie.type || "image/jpeg");
  }

  await updateApplication(app.id, {
    church_legal_name: s("church_legal_name"),
    it_number: s("it_number"),
    address: s("address"),
    applicant_role: s("applicant_role"),
    id_type: idType,
    email,
    email_verified_at: new Date().toISOString(),
    selfie_path: selfiePath ?? null,
    consent_at: new Date().toISOString(),
  });

  await runKycChecks({ id: app.id, itNumber: s("it_number"), churchLegalName: s("church_legal_name"), idType, idNumber, applicantRole: s("applicant_role") });

  await updateApplication(app.id, { status: "pending" });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run tests + full suite + build**

Run: `npx vitest run src/app/api/onboard/submit/route.test.ts`
Run: `npx vitest run && npx tsc --noEmit`
Run: `npm run build` (confirms the page + routes compile)
Expected: all pass; `/onboard/[token]`, `/api/onboard/email-code`, `/api/onboard/submit` in the build output.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboard/submit
git commit -m "feat: onboard submit route — verify email, store selfie, run KYC checks, queue pending"
```

---

## Self-Review Notes

**Spec coverage (this plan = applicant-facing intake):** email verify via Resend → Task 1; private selfie storage → Task 2; web form + page + email-code route → Task 3; submit route (checks + queue pending) → Task 4. The review dashboard/approval (Plan 3) and the WhatsApp "set up my church" rewire + tiered access (Plan 4) are out of scope by decomposition. BVN lookup remains stubbed in the engine (Plan 1) — surfaced here as a selectable `id_type` but the actual BVN call is a later engine task.

**Placeholder scan:** none — every step carries real code. Resend `from` defaults to `onboarding@resend.dev` (works without a verified domain) and email delivery is non-fatal so the flow builds/tests without a live `RESEND_API_KEY`.

**Type consistency:** `resolveByToken`/`updateApplication`/`runKycChecks` (Plan 1) are used with their Plan-1 signatures; `sendEmailOtp`/`verifyEmailOtp` (Task 1) and `uploadKycFile`/`signedKycUrl` (Task 2) match their uses in Tasks 3–4. `id_type` is the same `"nin"|"bvn"` union across the form, submit route, and `runKycChecks`.
