# KYC Review Dashboard + Approval — Implementation Plan (Slice 2, Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The reviewer-facing half: a platform-admin dashboard at `/admin/kyc` that lists pending church applications, shows all data + Mono results + the selfie beside the Mono ID photo, and lets an allow-listed admin **approve** (creates the org/workspace, seats the applicant as `creator`, WhatsApp-notifies) or **reject** (records a reason, WhatsApp-notifies).

**Architecture:** The app's auth is client-side Supabase, so secure enforcement lives in the API routes: the client sends its session JWT as a Bearer token, the route verifies it via `getSupabaseUserClient(token).auth.getUser()` and checks the email against a `PLATFORM_ADMIN_EMAILS` allowlist. Approval provisioning mirrors the proven `approveOrganization` flow (org + workspace insert + `provisionPersonMembership`). Pages are thin client components that call these routes.

**Tech Stack:** Next.js 16 (route handlers, async params), TypeScript, Supabase (service-role + user-JWT clients), Vitest.

## Global Constraints

- **Reviewer auth:** `PLATFORM_ADMIN_EMAILS` (comma-separated env). Enforced server-side in every `/api/admin/*` route; pages never trust the client.
- Selfie/ID photos shown via short-lived **signed URLs** (`signedKycUrl`) or inline data URLs from Mono — never public storage links.
- Approve/reject is **idempotent** (acts only on a `pending` row) and WhatsApp-notify failure never blocks the state change.
- `kyc_applications` is service-role only (RLS deny-all) — all access is through the service client in server code.
- Provisioning reuses: `provisionPersonMembership` (identity/provisioning), `foundingAdminRole("church")` = `creator` (role-catalog), `slugifyWorkspaceName` (onboarding-draft), `sendOrgApprovedTemplate`/`sendOrgRejectedTemplate` (whatsapp-templates).

---

## Task 1: Platform-admin auth gate

**Files:**
- Create: `src/lib/services/kyc/admin-auth.ts`
- Test: `src/lib/services/kyc/admin-auth.test.ts`

**Interfaces:**
- Consumes: `getSupabaseUserClient(token)` (supabase-server).
- Produces: `platformAdminEmail(token: string | null): Promise<string | null>` — returns the verified admin email if the token's user is allow-listed, else `null`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/kyc/admin-auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseUserClient: (t: string) => (t ? { auth: { getUser: getUserMock } } : null),
}));

import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";

beforeEach(() => { getUserMock.mockReset(); process.env.PLATFORM_ADMIN_EMAILS = "boss@chertt.com, ops@chertt.com"; });

describe("platformAdminEmail", () => {
  it("returns the email for an allow-listed user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "Ops@Chertt.com" } }, error: null });
    expect(await platformAdminEmail("tok")).toBe("ops@chertt.com");
  });
  it("returns null for a non-allow-listed user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "random@x.com" } }, error: null });
    expect(await platformAdminEmail("tok")).toBeNull();
  });
  it("returns null with no token", async () => {
    expect(await platformAdminEmail(null)).toBeNull();
  });
  it("returns null when the token doesn't resolve to a user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await platformAdminEmail("tok")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/admin-auth.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/kyc/admin-auth.ts`:
```typescript
import { getSupabaseUserClient } from "@/lib/services/supabase-server";

function allowlist(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

// Verifies a caller's Supabase JWT and returns their email IFF it's on the
// PLATFORM_ADMIN_EMAILS allowlist. Returns null otherwise. This is the single
// server-side gate for the KYC review console.
export async function platformAdminEmail(token: string | null): Promise<string | null> {
  if (!token) return null;
  const client = getSupabaseUserClient(token);
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  return allowlist().includes(email) ? email : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/admin-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/kyc/admin-auth.ts src/lib/services/kyc/admin-auth.test.ts
git commit -m "feat: platform-admin auth gate for KYC review (PLATFORM_ADMIN_EMAILS)"
```

---

## Task 2: Review service (list / detail / approve / reject)

**Files:**
- Create: `src/lib/services/kyc/review.ts`
- Test: `src/lib/services/kyc/review.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient` (supabase-server), `signedKycUrl` (kyc/storage), `provisionPersonMembership` (identity/provisioning), `foundingAdminRole` (role-catalog), `slugifyWorkspaceName` (onboarding-draft), `sendOrgApprovedTemplate`/`sendOrgRejectedTemplate` (whatsapp-templates).
- Produces:
  - `listPendingApplications(): Promise<PendingRow[]>` where `PendingRow = { id, church_legal_name, applicant_phone, trustee_match, created_at }`.
  - `getApplicationForReview(id: string): Promise<ReviewDetail | null>` — full row + `selfieUrl` (signed) + `idPhotoDataUrl` (from Mono NIN photo base64).
  - `approveKycApplication(id: string, reviewerEmail: string): Promise<{ ok: boolean; workspaceSlug?: string; reason?: string }>`.
  - `rejectKycApplication(id: string, reviewerEmail: string, reason: string): Promise<{ ok: boolean }>`.
  Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/kyc/review.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, provisionMock, approvedTplMock, rejectedTplMock } = vi.hoisted(() => ({
  store: { app: null as any, updates: [] as any[], workspace: { id: "ws1", slug: "grace", name: "Grace Chapel" }, org: { id: "org1" } },
  provisionMock: vi.fn().mockResolvedValue(true),
  approvedTplMock: vi.fn().mockResolvedValue(undefined),
  rejectedTplMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: store.app ? [store.app] : [] }) }),
          maybeSingle: () => Promise.resolve({ data: store.app }),
          order: () => Promise.resolve({ data: store.app ? [store.app] : [] }),
        }),
      }),
      insert: (row: any) => ({ select: () => ({ single: () => Promise.resolve({ data: table === "workspaces" ? store.workspace : store.org, error: null }) }) }),
      update: (patch: any) => ({ eq: () => { store.updates.push({ table, patch }); return Promise.resolve({ error: null }); } }),
    }),
  }),
}));
vi.mock("@/lib/services/kyc/storage", () => ({ signedKycUrl: vi.fn().mockResolvedValue("https://signed/selfie") }));
vi.mock("@/lib/services/identity/provisioning", () => ({ provisionPersonMembership: provisionMock }));
vi.mock("@/lib/services/whatsapp-templates", () => ({ sendOrgApprovedTemplate: approvedTplMock, sendOrgRejectedTemplate: rejectedTplMock }));

import { getApplicationForReview, approveKycApplication, rejectKycApplication } from "@/lib/services/kyc/review";

const pendingApp = {
  id: "k1", status: "pending", applicant_phone: "234800", church_legal_name: "Grace Chapel",
  address: "Lagos", applicant_role: "Ada Obi, Trustee", selfie_path: "k1/selfie.jpg",
  id_result: { firstname: "Ada", surname: "Obi", photoBase64: "IMG64" }, trustee_match: "match", created_at: "2026-08-09",
};

beforeEach(() => { store.app = { ...pendingApp }; store.updates = []; vi.clearAllMocks(); });

describe("getApplicationForReview", () => {
  it("returns the row with a signed selfie url and an ID-photo data url", async () => {
    const d = await getApplicationForReview("k1");
    expect(d?.selfieUrl).toBe("https://signed/selfie");
    expect(d?.idPhotoDataUrl).toBe("data:image/jpeg;base64,IMG64");
  });
});

describe("approveKycApplication", () => {
  it("provisions the church, seats the creator, notifies, marks approved", async () => {
    const r = await approveKycApplication("k1", "ops@chertt.com");
    expect(r).toMatchObject({ ok: true, workspaceSlug: "grace" });
    expect(provisionMock).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "234800", role: "creator", workspaceId: "ws1" }));
    expect(approvedTplMock).toHaveBeenCalledWith("234800", expect.any(String), "Grace Chapel");
    expect(store.updates.some((u) => u.table === "kyc_applications" && u.patch.status === "approved" && u.patch.workspace_id === "ws1")).toBe(true);
  });
  it("is idempotent — refuses a non-pending row", async () => {
    store.app = { ...pendingApp, status: "approved" };
    expect(await approveKycApplication("k1", "ops@chertt.com")).toMatchObject({ ok: false });
    expect(provisionMock).not.toHaveBeenCalled();
  });
});

describe("rejectKycApplication", () => {
  it("records the reason, notifies, marks rejected", async () => {
    const r = await rejectKycApplication("k1", "ops@chertt.com", "CAC name mismatch");
    expect(r.ok).toBe(true);
    expect(rejectedTplMock).toHaveBeenCalledWith("234800", "Grace Chapel", "CAC name mismatch");
    expect(store.updates.some((u) => u.patch.status === "rejected" && u.patch.reject_reason === "CAC name mismatch")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/review.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/kyc/review.ts`:
```typescript
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { signedKycUrl } from "@/lib/services/kyc/storage";
import { provisionPersonMembership } from "@/lib/services/identity/provisioning";
import { foundingAdminRole } from "@/lib/services/identity/role-catalog";
import { slugifyWorkspaceName } from "@/lib/services/onboarding-draft";
import { sendOrgApprovedTemplate, sendOrgRejectedTemplate } from "@/lib/services/whatsapp-templates";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PendingRow = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; created_at: string };
export type ReviewDetail = Record<string, any> & { selfieUrl: string | null; idPhotoDataUrl: string | null };

export async function listPendingApplications(): Promise<PendingRow[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data } = await db
    .from("kyc_applications")
    .select("id, church_legal_name, applicant_phone, trustee_match, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data as PendingRow[]) ?? [];
}

async function loadApp(db: any, id: string): Promise<any | null> {
  const { data } = await db.from("kyc_applications").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function getApplicationForReview(id: string): Promise<ReviewDetail | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const app = await loadApp(db, id);
  if (!app) return null;
  const selfieUrl = app.selfie_path ? await signedKycUrl(app.selfie_path) : null;
  const photo = app.id_result?.photoBase64;
  const idPhotoDataUrl = photo ? `data:image/jpeg;base64,${photo}` : null;
  return { ...app, selfieUrl, idPhotoDataUrl };
}

// Approve: provision the church (org + workspace), seat the applicant as
// creator, mark approved, notify. Idempotent — acts only on a pending row.
export async function approveKycApplication(id: string, reviewerEmail: string): Promise<{ ok: boolean; workspaceSlug?: string; reason?: string }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false, reason: "no_db" };
  const app = await loadApp(db, id);
  if (!app) return { ok: false, reason: "not_found" };
  if (app.status !== "pending") return { ok: false, reason: "not_pending" };

  const name = app.church_legal_name || "New Church";
  const { data: org } = await db.from("organizations").insert({
    name, status: "active", requested_by_phone: app.applicant_phone,
    requested_by_name: app.applicant_role || name, requested_city: app.address || "Unspecified", requested_size: app.size || "unknown",
  }).select("id").single();

  let slug = slugifyWorkspaceName(name);
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await db.from("workspaces").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${slugifyWorkspaceName(name)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const { data: ws, error: wsErr } = await db.from("workspaces").insert({
    slug, name, legal_name: name, city: app.address || "Unspecified", timezone: "Africa/Lagos", organization_id: org?.id,
  }).select("id, slug, name").single();
  if (wsErr || !ws) return { ok: false, reason: "workspace_failed" };

  const founderName = app.id_result?.firstname ? `${app.id_result.firstname} ${app.id_result.surname ?? ""}`.trim() : (app.applicant_role || name);
  await provisionPersonMembership({
    phoneNumber: app.applicant_phone, fullName: founderName, workspaceId: ws.id,
    workspaceSlug: ws.slug, workspaceName: ws.name, role: foundingAdminRole("church"), organizationId: org?.id,
  });

  await db.from("kyc_applications").update({
    status: "approved", workspace_id: ws.id, reviewed_by: reviewerEmail, reviewed_at: new Date().toISOString(),
  }).eq("id", id);

  try { await sendOrgApprovedTemplate(app.applicant_phone, founderName, ws.name); } catch { /* notify is best-effort */ }
  return { ok: true, workspaceSlug: ws.slug };
}

export async function rejectKycApplication(id: string, reviewerEmail: string, reason: string): Promise<{ ok: boolean }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false };
  const app = await loadApp(db, id);
  if (!app || app.status !== "pending") return { ok: false };
  await db.from("kyc_applications").update({
    status: "rejected", reject_reason: reason, reviewed_by: reviewerEmail, reviewed_at: new Date().toISOString(),
  }).eq("id", id);
  try { await sendOrgRejectedTemplate(app.applicant_phone, app.church_legal_name || "your church", reason); } catch { /* best-effort */ }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/review.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/kyc/review.ts src/lib/services/kyc/review.test.ts
git commit -m "feat: KYC review service — list, detail, approve (provisions church), reject"
```

---

## Task 3: Admin API routes

**Files:**
- Create: `src/app/api/admin/kyc/route.ts`, `src/app/api/admin/kyc/[id]/route.ts`
- Test: `src/app/api/admin/kyc/route.test.ts`

**Interfaces:**
- Consumes: `platformAdminEmail` (Task 1), all four review-service functions (Task 2).
- Produces: `GET /api/admin/kyc` (list), `GET /api/admin/kyc/[id]` (detail), `POST /api/admin/kyc/[id]` (`{action:"approve"}` or `{action:"reject", reason}`). All read the Bearer token from `Authorization`.

Helper convention: `bearer(req)` = `req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/kyc/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/services/kyc/admin-auth", () => ({ platformAdminEmail: adminMock }));
vi.mock("@/lib/services/kyc/review", () => ({
  listPendingApplications: vi.fn().mockResolvedValue([{ id: "k1", church_legal_name: "Grace" }]),
  getApplicationForReview: vi.fn(),
  approveKycApplication: vi.fn(),
  rejectKycApplication: vi.fn(),
}));

import { GET } from "@/app/api/admin/kyc/route";

const req = (auth?: string) => new Request("https://x/api/admin/kyc", { headers: auth ? { authorization: auth } : {} });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/kyc", () => {
  it("401s a non-admin", async () => {
    adminMock.mockResolvedValue(null);
    expect((await GET(req("Bearer bad"))).status).toBe(401);
  });
  it("returns the pending list for an admin", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applications: [{ id: "k1", church_legal_name: "Grace" }] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/kyc/route.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement the list route**

Create `src/app/api/admin/kyc/route.ts`:
```typescript
import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { listPendingApplications } from "@/lib/services/kyc/review";

export const dynamic = "force-dynamic";

function bearer(req: Request): string | null {
  return req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  return Response.json({ applications: await listPendingApplications() });
}
```

- [ ] **Step 4: Implement the detail + action route**

Create `src/app/api/admin/kyc/[id]/route.ts`:
```typescript
import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { getApplicationForReview, approveKycApplication, rejectKycApplication } from "@/lib/services/kyc/review";

export const dynamic = "force-dynamic";

function bearer(req: Request): string | null {
  return req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const detail = await getApplicationForReview(id);
  if (!detail) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ application: detail });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await platformAdminEmail(bearer(req));
  if (!admin) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  if (body.action === "approve") {
    const r = await approveKycApplication(id, admin);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  }
  if (body.action === "reject") {
    if (!body.reason?.trim()) return Response.json({ ok: false, error: "A reason is required." }, { status: 400 });
    const r = await rejectKycApplication(id, admin, body.reason.trim());
    return Response.json(r, { status: r.ok ? 200 : 409 });
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/app/api/admin/kyc/route.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/kyc
git commit -m "feat: admin KYC API — list, detail, approve/reject (allowlist-gated)"
```

---

## Task 4: Admin dashboard pages

**Files:**
- Create: `src/app/admin/kyc/page.tsx`, `src/app/admin/kyc/[id]/page.tsx`

**Interfaces:**
- Consumes: `getSupabaseBrowserClient` (supabase) for the session token; the Task-3 routes.
- Produces: the reviewer UI. No new server interfaces.

Auth token pattern (client): `const { data } = await getSupabaseBrowserClient()!.auth.getSession(); const token = data.session?.access_token;` then `fetch(url, { headers: { Authorization: \`Bearer ${token}\` } })`.

- [ ] **Step 1: List page**

Create `src/app/admin/kyc/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

type Row = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; created_at: string };

export default function AdminKycList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const supa = getSupabaseBrowserClient();
      const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
      const res = await fetch("/api/admin/kyc", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.status === 401) { setDenied(true); return; }
      const j = await res.json();
      setRows(j.applications ?? []);
    })();
  }, []);

  if (denied) return <Shell><h2>Not authorized</h2><p style={sub}>Your account isn&apos;t on the Chertt review team.</p></Shell>;
  if (!rows) return <Shell><p style={sub}>Loading…</p></Shell>;

  return (
    <Shell>
      <h2>Church applications — pending review</h2>
      <p style={sub}>{rows.length} awaiting a decision.</p>
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {rows.map((r) => (
          <Link key={r.id} href={`/admin/kyc/${r.id}`} style={card}>
            <div style={{ fontWeight: 700 }}>{r.church_legal_name || "Unnamed church"}</div>
            <div style={sub}>{r.applicant_phone} · trustee: {r.trustee_match ?? "—"}</div>
          </Link>
        ))}
        {rows.length === 0 && <p style={sub}>Nothing pending. 🎉</p>}
      </div>
    </Shell>
  );
}

const sub = { color: "#9baba0", fontSize: 14 } as const;
const card = { display: "block", padding: 14, borderRadius: 12, border: "1px solid #26332b", background: "#141d18", color: "#e8efe9", textDecoration: "none" } as const;
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#0e1512", color: "#e8efe9", fontFamily: "system-ui", padding: 24, display: "flex", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: 720 }}>{children}</div></div>;
}
```

- [ ] **Step 2: Detail / review page**

Create `src/app/admin/kyc/[id]/page.tsx`:
```tsx
"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function authHeader() {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminKycDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [app, setApp] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/kyc/${id}`, { headers: await authHeader() });
      if (!res.ok) { setMsg("Not authorized or not found."); return; }
      setApp((await res.json()).application);
    })();
  }, [id]);

  async function act(action: "approve" | "reject") {
    let reason = "";
    if (action === "reject") { reason = window.prompt("Reason for rejection (sent to the applicant):") ?? ""; if (!reason.trim()) return; }
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/kyc/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action, reason }) });
    const j = await res.json();
    setBusy(false);
    if (j.ok) { router.push("/admin/kyc"); } else { setMsg(j.error ?? j.reason ?? "Action failed."); }
  }

  if (msg && !app) return <Shell><p style={sub}>{msg}</p></Shell>;
  if (!app) return <Shell><p style={sub}>Loading…</p></Shell>;

  return (
    <Shell>
      <h2>{app.church_legal_name}</h2>
      <p style={sub}>IT/RC {app.it_number} · {app.address}</p>

      <Section title="Applicant">
        <Row k="Stated" v={app.applicant_role} />
        <Row k="Phone" v={app.applicant_phone} />
        <Row k="Email" v={`${app.email ?? "—"}${app.email_verified_at ? " ✓" : ""}`} />
        <Row k="Trustee match" v={app.trustee_match} />
      </Section>

      <Section title="Identity photos (compare)">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Photo label="Selfie holding ID" src={app.selfieUrl} />
          <Photo label="ID photo (Mono)" src={app.idPhotoDataUrl} />
        </div>
      </Section>

      <Section title="CAC lookup"><pre style={pre}>{JSON.stringify(app.cac_result, null, 2)}</pre></Section>
      <Section title="ID lookup"><pre style={pre}>{JSON.stringify(app.id_result, null, 2)}</pre></Section>

      {msg && <p style={{ color: "#ff6b6b" }}>{msg}</p>}
      {app.status === "pending" ? (
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button disabled={busy} onClick={() => act("approve")} style={btn}>Approve & create church</button>
          <button disabled={busy} onClick={() => act("reject")} style={btnGhost}>Reject…</button>
        </div>
      ) : <p style={sub}>Already {app.status}.</p>}
    </Shell>
  );
}

const sub = { color: "#9baba0", fontSize: 14 } as const;
const pre = { background: "#0b120e", border: "1px solid #26332b", borderRadius: 10, padding: 12, overflowX: "auto", fontSize: 12, color: "#c7d2cb" } as const;
const btn = { padding: "12px 16px", border: "none", borderRadius: 12, background: "#0b3d2e", color: "#fff", fontWeight: 700, cursor: "pointer" } as const;
const btnGhost = { padding: "12px 16px", border: "1px solid #7a2e2e", borderRadius: 12, background: "transparent", color: "#ff9b9b", fontWeight: 700, cursor: "pointer" } as const;
function Row({ k, v }: { k: string; v: any }) { return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, padding: "4px 0" }}><span style={sub}>{k}</span><span>{String(v ?? "—")}</span></div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div style={{ marginTop: 20 }}><h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#7fd4a8" }}>{title}</h3>{children}</div>; }
function Photo({ label, src }: { label: string; src: string | null }) {
  return <div style={{ flex: "1 1 200px" }}><div style={sub}>{label}</div>{src ? <img src={src} alt={label} style={{ width: "100%", borderRadius: 10, border: "1px solid #26332b" }} /> : <div style={{ ...sub, padding: 20 }}>No image</div>}</div>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#0e1512", color: "#e8efe9", fontFamily: "system-ui", padding: 24, display: "flex", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: 720 }}>{children}</div></div>;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: no errors; `/admin/kyc` and `/admin/kyc/[id]` in the build output.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/kyc
git commit -m "feat: KYC review dashboard pages (list + side-by-side photo review)"
```

---

## Self-Review Notes

**Spec coverage (this plan = review + approval):** dashboard auth via `PLATFORM_ADMIN_EMAILS` → Task 1; list + detail with selfie-beside-Mono-photo → Tasks 2 & 4; approve creates workspace + seats `creator` + WhatsApp notify, reject records reason + notify → Task 2 (service) + Task 3 (routes); idempotency + best-effort notify → Task 2. Tiered access (block money/invite/broadcast for non-approved churches) and the WhatsApp "set up my church" → token rewire are **Plan 4**, by decomposition.

**Placeholder scan:** none — every step has real code. `window.prompt` is used for the reject reason (simple, no extra modal component); acceptable for an internal admin tool.

**Type consistency:** `platformAdminEmail` (Task 1) returns `string | null` and is consumed that way in Task 3. The four review-service functions (Task 2) match their calls in Task 3. `provisionPersonMembership` is called with the exact option keys it declares (`phoneNumber`, `fullName`, `workspaceId`, `workspaceSlug`, `workspaceName`, `role`, `organizationId`). `foundingAdminRole("church")` returns `"creator"` (role-catalog, Slice 1) — matched in the approve test.
