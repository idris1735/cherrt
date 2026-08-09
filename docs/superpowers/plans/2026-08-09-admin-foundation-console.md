# Platform-Admin Foundation Console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only platform-admin console (`/admin`) — Overview, Churches list, Church detail — that makes the Phase-1 foundation visible, built in a coherent Vercel-minimal light design system that replaces the ad-hoc dark-green styling on the existing KYC/onboard pages.

**Architecture:** A foundation service (service-role reads) behind allowlist-gated API routes (same `platformAdminEmail` pattern as KYC). Thin client pages fetch those routes and render with a shared CSS-module kit driven by the existing `globals.css` `:root` tokens. A shared `/admin` layout provides the nav.

**Tech Stack:** Next.js 16 (App Router, client pages + route handlers), TypeScript, Supabase (service-role), CSS Modules, Vitest.

## Global Constraints

- Design tokens come ONLY from existing `:root` in `globals.css` (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--radius-*`, `--shadow`, `--font-sans`). No new color literals except semantic status (green/amber/red) for badges. Orange `--accent` used only on the primary action + active nav.
- Light mode only. No shadows beyond `--shadow`. Hairline `--line` borders. ~10px radii.
- Every `/api/admin/*` route enforces `platformAdminEmail(bearer)` and 401s otherwise.
- Reads are service-role (RLS-safe); the console never mutates.
- Reuse `verificationLevel` (identity/verification) for member levels.

---

## Task 1: Foundation service

**Files:**
- Create: `src/lib/services/admin/foundation.ts`
- Test: `src/lib/services/admin/foundation.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient`, `verificationLevel(personId)`.
- Produces:
  - `platformOverview(): Promise<{ churches: { total: number; active: number; pending: number }; pendingKyc: number; members: number; people: { verified: number; unverified: number }; recentKyc: Array<{ id: string; church: string; status: string; createdAt: string }>; recentChurches: Array<{ id: string; name: string; status: string; createdAt: string }> }>`
  - `listChurches(): Promise<Array<{ id: string; name: string; status: string; branches: number; members: number; createdAt: string }>>`
  - `getChurchDetail(id: string): Promise<{ org: Record<string, unknown>; workspaces: Array<{ id: string; name: string; city: string | null }>; members: Array<{ name: string; role: string; level: 0 | 1 | 2; joinedAt: string }>; kyc: { id: string; status: string } | null } | null>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/admin/foundation.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { tables } = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));
// Minimal query builder: supports .select().eq()/.in()/.order()/.maybeSingle() and
// resolves to { data } filtered by recorded eq()/in() constraints.
function builder(rows: any[]) {
  let filtered = [...rows];
  const api: any = {
    select: () => api,
    eq: (k: string, v: any) => { filtered = filtered.filter((r) => r[k] === v); return api; },
    in: (k: string, vs: any[]) => { filtered = filtered.filter((r) => vs.includes(r[k])); return api; },
    order: () => api,
    limit: (n: number) => { filtered = filtered.slice(0, n); return Promise.resolve({ data: filtered }); },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null }),
    then: (res: any) => res({ data: filtered }),
  };
  return api;
}
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({ from: (t: string) => builder(tables[t] ?? []) }),
}));
vi.mock("@/lib/services/identity/verification", () => ({ verificationLevel: vi.fn().mockResolvedValue(1) }));

import { platformOverview, listChurches, getChurchDetail } from "@/lib/services/admin/foundation";

beforeEach(() => {
  tables.organizations = [
    { id: "o1", name: "Grace Chapel", status: "active", created_at: "2026-08-01", requested_city: "Lagos", approved_by: "ops@x" },
    { id: "o2", name: "Hope Center", status: "pending_approval", created_at: "2026-08-02" },
  ];
  tables.workspaces = [
    { id: "w1", name: "Grace HQ", city: "Lagos", organization_id: "o1" },
    { id: "w2", name: "Grace Ikeja", city: "Ikeja", organization_id: "o1" },
  ];
  tables.branch_memberships = [
    { id: "m1", person_id: "p1", workspace_id: "w1", role: "creator", status: "active", created_at: "2026-08-01" },
    { id: "m2", person_id: "p2", workspace_id: "w1", role: "member", status: "active", created_at: "2026-08-02" },
  ];
  tables.people = [{ id: "p1", full_name: "Ada Obi" }, { id: "p2", full_name: "Sam Eze" }];
  tables.phone_contacts = [{ person_id: "p1", status: "active", verified_at: "2026-08-01" }, { person_id: "p2", status: "active", verified_at: null }];
  tables.kyc_applications = [{ id: "k1", church_legal_name: "Grace Chapel", status: "pending", created_at: "2026-08-03", workspace_id: "w1" }];
});

describe("platformOverview", () => {
  it("counts churches, members, verified people, pending KYC", async () => {
    const o = await platformOverview();
    expect(o.churches).toEqual({ total: 2, active: 1, pending: 1 });
    expect(o.members).toBe(2);
    expect(o.people).toEqual({ verified: 1, unverified: 1 });
    expect(o.pendingKyc).toBe(1);
    expect(o.recentChurches.length).toBeGreaterThan(0);
  });
});

describe("listChurches", () => {
  it("returns each church with branch + member counts", async () => {
    const list = await listChurches();
    const grace = list.find((c) => c.id === "o1")!;
    expect(grace).toMatchObject({ name: "Grace Chapel", status: "active", branches: 2, members: 2 });
  });
});

describe("getChurchDetail", () => {
  it("assembles org + workspaces + members (with level) + kyc", async () => {
    const d = await getChurchDetail("o1");
    expect(d?.workspaces.length).toBe(2);
    expect(d?.members.map((m) => m.name).sort()).toEqual(["Ada Obi", "Sam Eze"]);
    expect(d?.members[0].level).toBe(1);
    expect(d?.kyc).toMatchObject({ id: "k1", status: "pending" });
  });
  it("returns null for an unknown church", async () => {
    expect(await getChurchDetail("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/admin/foundation.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/admin/foundation.ts`:
```typescript
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { verificationLevel } from "@/lib/services/identity/verification";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function platformOverview() {
  const db = getSupabaseServerClient();
  const empty = { churches: { total: 0, active: 0, pending: 0 }, pendingKyc: 0, members: 0, people: { verified: 0, unverified: 0 }, recentKyc: [], recentChurches: [] };
  if (!db) return empty;
  const [orgsRes, memRes, contactsRes, kycRes] = await Promise.all([
    db.from("organizations").select("id, name, status, created_at"),
    db.from("branch_memberships").select("id, status").eq("status", "active"),
    db.from("phone_contacts").select("person_id, verified_at, status").eq("status", "active"),
    db.from("kyc_applications").select("id, church_legal_name, status, created_at"),
  ]);
  const orgs = (orgsRes.data ?? []) as any[];
  const contacts = (contactsRes.data ?? []) as any[];
  const kyc = (kycRes.data ?? []) as any[];
  const verifiedPeople = new Set(contacts.filter((c) => c.verified_at).map((c) => c.person_id));
  const allPeople = new Set(contacts.map((c) => c.person_id));
  return {
    churches: { total: orgs.length, active: orgs.filter((o) => o.status === "active").length, pending: orgs.filter((o) => o.status === "pending_approval").length },
    pendingKyc: kyc.filter((k) => k.status === "pending").length,
    members: (memRes.data ?? []).length,
    people: { verified: verifiedPeople.size, unverified: allPeople.size - verifiedPeople.size },
    recentKyc: [...kyc].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5)
      .map((k) => ({ id: k.id, church: k.church_legal_name ?? "—", status: k.status, createdAt: k.created_at })),
    recentChurches: [...orgs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5)
      .map((o) => ({ id: o.id, name: o.name, status: o.status, createdAt: o.created_at })),
  };
}

export async function listChurches() {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const orgs = ((await db.from("organizations").select("id, name, status, created_at").order("created_at", { ascending: false })).data ?? []) as any[];
  const workspaces = ((await db.from("workspaces").select("id, organization_id")).data ?? []) as any[];
  const memberships = ((await db.from("branch_memberships").select("workspace_id, status").eq("status", "active")).data ?? []) as any[];
  const wsByOrg = new Map<string, string[]>();
  for (const w of workspaces) { if (!w.organization_id) continue; const a = wsByOrg.get(w.organization_id) ?? []; a.push(w.id); wsByOrg.set(w.organization_id, a); }
  const memByWs = new Map<string, number>();
  for (const m of memberships) memByWs.set(m.workspace_id, (memByWs.get(m.workspace_id) ?? 0) + 1);
  return orgs.map((o) => {
    const wsIds = wsByOrg.get(o.id) ?? [];
    return { id: o.id, name: o.name, status: o.status, branches: wsIds.length, members: wsIds.reduce((n, id) => n + (memByWs.get(id) ?? 0), 0), createdAt: o.created_at };
  });
}

export async function getChurchDetail(id: string) {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const org = (await db.from("organizations").select("*").eq("id", id).maybeSingle()).data as any;
  if (!org) return null;
  const workspaces = ((await db.from("workspaces").select("id, name, city").eq("organization_id", id)).data ?? []) as any[];
  const wsIds = workspaces.map((w) => w.id);
  const memberships = wsIds.length
    ? (((await db.from("branch_memberships").select("person_id, role, status, created_at").in("workspace_id", wsIds).eq("status", "active")).data ?? []) as any[])
    : [];
  const personIds = [...new Set(memberships.map((m) => m.person_id))];
  const people = personIds.length ? (((await db.from("people").select("id, full_name").in("id", personIds)).data ?? []) as any[]) : [];
  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  const members = await Promise.all(memberships.map(async (m) => ({
    name: nameById.get(m.person_id) ?? "Unknown",
    role: m.role,
    level: await verificationLevel(m.person_id),
    joinedAt: m.created_at,
  })));
  const kycRow = (await db.from("kyc_applications").select("id, status").eq("workspace_id", wsIds[0] ?? "___none___").maybeSingle()).data as any;
  return { org, workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, city: w.city ?? null })), members, kyc: kycRow ? { id: kycRow.id, status: kycRow.status } : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/admin/foundation.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/admin/foundation.ts src/lib/services/admin/foundation.test.ts
git commit -m "feat: admin foundation service — overview, church list, church detail"
```

---

## Task 2: Admin API routes (overview + churches)

**Files:**
- Create: `src/app/api/admin/overview/route.ts`, `src/app/api/admin/churches/route.ts`, `src/app/api/admin/churches/[id]/route.ts`
- Test: `src/app/api/admin/overview/route.test.ts`

**Interfaces:**
- Consumes: `platformAdminEmail` (kyc/admin-auth), the three foundation functions (Task 1).
- Produces: `GET /api/admin/overview` → `{ overview }`; `GET /api/admin/churches` → `{ churches }`; `GET /api/admin/churches/[id]` → `{ church }` or 404.

Shared `bearer(req)` convention (same as KYC routes): `req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/overview/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/lib/services/kyc/admin-auth", () => ({ platformAdminEmail: adminMock }));
vi.mock("@/lib/services/admin/foundation", () => ({
  platformOverview: vi.fn().mockResolvedValue({ churches: { total: 3 } }),
  listChurches: vi.fn(),
  getChurchDetail: vi.fn(),
}));

import { GET } from "@/app/api/admin/overview/route";
const req = (auth?: string) => new Request("https://x/api/admin/overview", { headers: auth ? { authorization: auth } : {} });
beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/overview", () => {
  it("401s a non-admin", async () => { adminMock.mockResolvedValue(null); expect((await GET(req("Bearer x"))).status).toBe(401); });
  it("returns the overview for an admin", async () => {
    adminMock.mockResolvedValue("ops@chertt.com");
    const res = await GET(req("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ overview: { churches: { total: 3 } } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/admin/overview/route.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement the three routes**

Create `src/app/api/admin/overview/route.ts`:
```typescript
import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { platformOverview } from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function GET(req: Request): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  return Response.json({ overview: await platformOverview() });
}
```

Create `src/app/api/admin/churches/route.ts`:
```typescript
import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { listChurches } from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function GET(req: Request): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  return Response.json({ churches: await listChurches() });
}
```

Create `src/app/api/admin/churches/[id]/route.ts`:
```typescript
import { platformAdminEmail } from "@/lib/services/kyc/admin-auth";
import { getChurchDetail } from "@/lib/services/admin/foundation";

export const dynamic = "force-dynamic";
const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? null;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await platformAdminEmail(bearer(req)))) return Response.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const church = await getChurchDetail(id);
  if (!church) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ church });
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/app/api/admin/overview/route.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/overview src/app/api/admin/churches
git commit -m "feat: admin foundation API routes (overview + churches, allowlist-gated)"
```

---

## Task 3: Design-system kit + shared `/admin` layout

**Files:**
- Create: `src/app/admin/admin.module.css`, `src/app/admin/layout.tsx`, `src/app/admin/admin-nav.tsx`

**Interfaces:**
- Produces: CSS classes consumed by all admin pages; a nav with active-route awareness.

- [ ] **Step 1: Write the CSS kit**

Create `src/app/admin/admin.module.css` (tokens → components; light, hairline, minimal):
```css
.shell { min-height: 100vh; background: var(--bg); color: var(--ink); font-family: var(--font-sans); }
.nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 20px; padding: 0 24px; height: 56px; background: var(--surface); border-bottom: 1px solid var(--line); }
.brand { font-weight: 700; letter-spacing: -0.01em; margin-right: 8px; }
.navlink { font-size: 14px; color: var(--muted); text-decoration: none; padding: 6px 0; border-bottom: 2px solid transparent; }
.navlinkActive { color: var(--ink); border-bottom-color: var(--accent); }
.main { max-width: 1080px; margin: 0 auto; padding: 28px 24px 64px; }
.h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 24px; }
.statGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 28px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 16px; }
.statLabel { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.statValue { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 6px; font-variant-numeric: tabular-nums; }
.statHint { font-size: 12px; color: var(--muted); margin-top: 2px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); overflow: hidden; }
.cardHead { padding: 14px 16px; border-bottom: 1px solid var(--line); font-weight: 600; font-size: 14px; }
.tableWrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { text-align: left; font-weight: 500; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.table td { padding: 12px 16px; border-bottom: 1px solid var(--line); }
.table tr:last-child td { border-bottom: none; }
.rowlink { color: var(--ink); text-decoration: none; font-weight: 500; }
.rowlink:hover { color: var(--accent); }
.badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.badgeActive { background: #e7f6ec; color: #17803d; }
.badgePending { background: #fdf3e2; color: #a3620a; }
.badgeRejected { background: #fce9e9; color: #b42020; }
.badgeNeutral { background: #f1f1f1; color: #555; }
.btn { display: inline-block; padding: 9px 14px; border-radius: var(--radius-sm); background: var(--accent); color: #fff; border: none; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; }
.btnGhost { display: inline-block; padding: 9px 14px; border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); border: 1px solid var(--line); font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; }
.empty { text-align: center; color: var(--muted); padding: 48px 16px; }
.back { color: var(--muted); text-decoration: none; font-size: 13px; }
.kvs { display: grid; grid-template-columns: auto 1fr; gap: 6px 20px; font-size: 14px; }
.kvKey { color: var(--muted); }
.photoRow { display: flex; gap: 16px; flex-wrap: wrap; }
.photo { flex: 1 1 220px; }
.photoImg { width: 100%; border-radius: var(--radius-sm); border: 1px solid var(--line); }
.pre { background: var(--surface-muted); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px; overflow-x: auto; font-size: 12px; color: var(--ink); }
.section { margin-top: 28px; }
.sectionTitle { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 10px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--ink); margin-bottom: 12px; }
.input, .select { padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 15px; }
.err { color: #b42020; font-size: 14px; }
```

- [ ] **Step 2: Nav component**

Create `src/app/admin/admin-nav.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./admin.module.css";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/churches", label: "Churches", exact: false },
  { href: "/admin/kyc", label: "KYC", exact: false },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className={s.nav}>
      <span className={s.brand}>Chertt Admin</span>
      {LINKS.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return <Link key={l.href} href={l.href} className={`${s.navlink} ${active ? s.navlinkActive : ""}`}>{l.label}</Link>;
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Layout**

Create `src/app/admin/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";
import s from "./admin.module.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.shell}>
      <AdminNav />
      <main className={s.main}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/admin.module.css src/app/admin/admin-nav.tsx src/app/admin/layout.tsx
git commit -m "feat: admin design-system kit (Vercel-minimal, light) + shared layout/nav"
```

---

## Task 4: Overview + Churches list + Church detail pages

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/churches/page.tsx`, `src/app/admin/churches/[id]/page.tsx`
- Create: `src/app/admin/use-admin-fetch.ts` (shared auth-fetch hook)

**Interfaces:**
- Consumes: `getSupabaseBrowserClient` (supabase), the Task-2 routes, the Task-3 CSS.

- [ ] **Step 1: Shared auth-fetch helper**

Create `src/app/admin/use-admin-fetch.ts`:
```typescript
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

// Fetches an admin API route with the caller's Supabase session JWT.
// Returns { status, data } — status 401 means "not authorized".
export async function adminFetch<T>(path: string): Promise<{ status: number; data: T | null }> {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = res.ok ? ((await res.json()) as T) : null;
  return { status: res.status, data };
}
```

- [ ] **Step 2: Overview page**

Create `src/app/admin/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "./admin.module.css";
import { adminFetch } from "./use-admin-fetch";

type Overview = {
  churches: { total: number; active: number; pending: number };
  pendingKyc: number; members: number; people: { verified: number; unverified: number };
  recentKyc: { id: string; church: string; status: string; createdAt: string }[];
  recentChurches: { id: string; name: string; status: string; createdAt: string }[];
};
function badge(status: string) {
  return status === "active" ? s.badgeActive : status === "rejected" ? s.badgeRejected : status.includes("pending") ? s.badgePending : s.badgeNeutral;
}

export default function AdminOverview() {
  const [o, setO] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => { adminFetch<{ overview: Overview }>("/api/admin/overview").then((r) => { if (r.status === 401) setDenied(true); else setO(r.data?.overview ?? null); }); }, []);
  if (denied) return <div className={s.empty}><h1 className={s.h1}>Not authorized</h1><p>Your account isn&apos;t on the Chertt review team.</p></div>;
  if (!o) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <h1 className={s.h1}>Overview</h1>
      <p className={s.sub}>The foundation at a glance.</p>
      <div className={s.statGrid}>
        <Stat label="Churches" value={o.churches.total} hint={`${o.churches.active} active · ${o.churches.pending} pending`} />
        <Stat label="Pending KYC" value={o.pendingKyc} hint="awaiting review" />
        <Stat label="Members" value={o.members} hint="active memberships" />
        <Stat label="Verified people" value={o.people.verified} hint={`${o.people.unverified} unverified`} />
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Recent applications</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {o.recentKyc.map((k) => <tr key={k.id}><td><Link className={s.rowlink} href={`/admin/kyc/${k.id}`}>{k.church}</Link></td><td><span className={`${s.badge} ${badge(k.status)}`}>{k.status}</span></td><td>{k.createdAt?.slice(0, 10)}</td></tr>)}
            {o.recentKyc.length === 0 && <tr><td colSpan={3} className={s.empty}>No applications yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Newest churches</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {o.recentChurches.map((c) => <tr key={c.id}><td><Link className={s.rowlink} href={`/admin/churches/${c.id}`}>{c.name}</Link></td><td><span className={`${s.badge} ${badge(c.status)}`}>{c.status}</span></td><td>{c.createdAt?.slice(0, 10)}</td></tr>)}
            {o.recentChurches.length === 0 && <tr><td colSpan={3} className={s.empty}>No churches yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </>
  );
}
function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div className={s.stat}><div className={s.statLabel}>{label}</div><div className={s.statValue}>{value}</div>{hint && <div className={s.statHint}>{hint}</div>}</div>;
}
```

- [ ] **Step 3: Churches list**

Create `src/app/admin/churches/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "../admin.module.css";
import { adminFetch } from "../use-admin-fetch";

type Church = { id: string; name: string; status: string; branches: number; members: number; createdAt: string };
const badge = (st: string) => st === "active" ? s.badgeActive : st === "rejected" ? s.badgeRejected : st.includes("pending") ? s.badgePending : s.badgeNeutral;

export default function ChurchesList() {
  const [rows, setRows] = useState<Church[] | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => { adminFetch<{ churches: Church[] }>("/api/admin/churches").then((r) => { if (r.status === 401) setDenied(true); else setRows(r.data?.churches ?? []); }); }, []);
  if (denied) return <div className={s.empty}><h1 className={s.h1}>Not authorized</h1></div>;
  if (!rows) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <h1 className={s.h1}>Churches</h1>
      <p className={s.sub}>{rows.length} on the platform.</p>
      <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>Name</th><th>Status</th><th>Branches</th><th>Members</th><th>Created</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><Link className={s.rowlink} href={`/admin/churches/${c.id}`}>{c.name}</Link></td>
              <td><span className={`${s.badge} ${badge(c.status)}`}>{c.status}</span></td>
              <td>{c.branches}</td><td>{c.members}</td><td>{c.createdAt?.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className={s.empty}>No churches yet.</td></tr>}
        </tbody>
      </table></div></div>
    </>
  );
}
```

- [ ] **Step 4: Church detail**

Create `src/app/admin/churches/[id]/page.tsx`:
```tsx
"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import s from "../../admin.module.css";
import { adminFetch } from "../../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = {
  org: any;
  workspaces: { id: string; name: string; city: string | null }[];
  members: { name: string; role: string; level: 0 | 1 | 2; joinedAt: string }[];
  kyc: { id: string; status: string } | null;
};
const LVL = ["Unverified", "WhatsApp-verified", "KYC-verified"];
const badge = (st: string) => st === "active" ? s.badgeActive : st === "rejected" ? s.badgeRejected : st.includes("pending") ? s.badgePending : s.badgeNeutral;

export default function ChurchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { adminFetch<{ church: Detail }>(`/api/admin/churches/${id}`).then((r) => { if (!r.data) setMsg("Not authorized or not found."); else setD(r.data.church); }); }, [id]);
  if (msg) return <div className={s.empty}>{msg}</div>;
  if (!d) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <Link href="/admin/churches" className={s.back}>← Churches</Link>
      <h1 className={s.h1} style={{ marginTop: 10 }}>{d.org.name} <span className={`${s.badge} ${badge(d.org.status)}`}>{d.org.status}</span></h1>
      <div className={s.section}>
        <div className={s.sectionTitle}>Details</div>
        <div className={s.kvs}>
          <span className={s.kvKey}>City</span><span>{d.org.requested_city ?? "—"}</span>
          <span className={s.kvKey}>Created</span><span>{d.org.created_at?.slice(0, 10) ?? "—"}</span>
          <span className={s.kvKey}>Approved by</span><span>{d.org.approved_by ?? "—"}</span>
          <span className={s.kvKey}>KYC</span><span>{d.kyc ? <Link className={s.rowlink} href={`/admin/kyc/${d.kyc.id}`}>{d.kyc.status}</Link> : "—"}</span>
        </div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Branches ({d.workspaces.length})</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>City</th></tr></thead>
          <tbody>{d.workspaces.map((w) => <tr key={w.id}><td>{w.name}</td><td>{w.city ?? "—"}</td></tr>)}
          {d.workspaces.length === 0 && <tr><td colSpan={2} className={s.empty}>No branches.</td></tr>}</tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Members ({d.members.length})</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>Role</th><th>Verification</th><th>Joined</th></tr></thead>
          <tbody>{d.members.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.role}</td><td>{LVL[m.level]}</td><td>{m.joinedAt?.slice(0, 10)}</td></tr>)}
          {d.members.length === 0 && <tr><td colSpan={4} className={s.empty}>No members yet.</td></tr>}</tbody>
        </table></div></div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: `/admin`, `/admin/churches`, `/admin/churches/[id]` in the output; no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/churches src/app/admin/use-admin-fetch.ts
git commit -m "feat: admin console pages — overview, churches list, church detail"
```

---

## Task 5: Restyle the KYC pages to the kit

**Files:**
- Modify: `src/app/admin/kyc/page.tsx`, `src/app/admin/kyc/[id]/page.tsx`

**Interfaces:** unchanged (same routes/behavior); only the markup/classes change from dark-green inline styles to `admin.module.css`.

- [ ] **Step 1: Rewrite the KYC list**

Replace `src/app/admin/kyc/page.tsx` with (uses `adminFetch` + the kit):
```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "../admin.module.css";
import { adminFetch } from "../use-admin-fetch";

type Row = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; created_at: string };
const tbadge = (m: string | null) => m === "match" ? s.badgeActive : m === "no_match" ? s.badgeRejected : s.badgeNeutral;

export default function AdminKycList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => { adminFetch<{ applications: Row[] }>("/api/admin/kyc").then((r) => { if (r.status === 401) setDenied(true); else setRows(r.data?.applications ?? []); }); }, []);
  if (denied) return <div className={s.empty}><h1 className={s.h1}>Not authorized</h1><p>Your account isn&apos;t on the Chertt review team.</p></div>;
  if (!rows) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <h1 className={s.h1}>KYC — pending review</h1>
      <p className={s.sub}>{rows.length} awaiting a decision.</p>
      <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>Church</th><th>Applicant</th><th>Trustee</th><th>Submitted</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link className={s.rowlink} href={`/admin/kyc/${r.id}`}>{r.church_legal_name || "Unnamed"}</Link></td>
              <td>{r.applicant_phone}</td>
              <td><span className={`${s.badge} ${tbadge(r.trustee_match)}`}>{r.trustee_match ?? "—"}</span></td>
              <td>{r.created_at?.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className={s.empty}>Nothing pending. 🎉</td></tr>}
        </tbody>
      </table></div></div>
    </>
  );
}
```

- [ ] **Step 2: Rewrite the KYC detail**

Replace `src/app/admin/kyc/[id]/page.tsx` with (kit-based; same approve/reject behavior):
```tsx
"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import s from "../../admin.module.css";
import { adminFetch } from "../../use-admin-fetch";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function authHeader(): Promise<Record<string, string>> {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
const badge = (st: string) => st === "match" || st === "approved" ? s.badgeActive : st === "no_match" || st === "rejected" ? s.badgeRejected : s.badgePending;

export default function AdminKycDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [app, setApp] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { adminFetch<{ application: any }>(`/api/admin/kyc/${id}`).then((r) => { if (!r.data) setMsg("Not authorized or not found."); else setApp(r.data.application); }); }, [id]);

  async function act(action: "approve" | "reject") {
    let reason = "";
    if (action === "reject") { reason = window.prompt("Reason for rejection (sent to the applicant):") ?? ""; if (!reason.trim()) return; }
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/kyc/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action, reason }) });
    const j = await res.json(); setBusy(false);
    if (j.ok) router.push("/admin/kyc"); else setMsg(j.error ?? j.reason ?? "Action failed.");
  }

  if (msg && !app) return <div className={s.empty}>{msg}</div>;
  if (!app) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <Link href="/admin/kyc" className={s.back}>← KYC</Link>
      <h1 className={s.h1} style={{ marginTop: 10 }}>{app.church_legal_name}</h1>
      <p className={s.sub}>IT/RC {app.it_number} · {app.address}</p>

      <div className={s.section}>
        <div className={s.sectionTitle}>Applicant</div>
        <div className={s.kvs}>
          <span className={s.kvKey}>Stated</span><span>{app.applicant_role ?? "—"}</span>
          <span className={s.kvKey}>Phone</span><span>{app.applicant_phone}</span>
          <span className={s.kvKey}>Email</span><span>{app.email ?? "—"}{app.email_verified_at ? " ✓" : ""}</span>
          <span className={s.kvKey}>Trustee</span><span><span className={`${s.badge} ${badge(app.trustee_match ?? "unknown")}`}>{app.trustee_match ?? "—"}</span></span>
        </div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Identity photos (compare)</div>
        <div className={s.photoRow}>
          <Photo label="Selfie holding ID" src={app.selfieUrl} />
          <Photo label="ID photo (Mono)" src={app.idPhotoDataUrl} />
        </div>
      </div>

      <div className={s.section}><div className={s.sectionTitle}>CAC lookup</div><pre className={s.pre}>{JSON.stringify(app.cac_result, null, 2)}</pre></div>
      <div className={s.section}><div className={s.sectionTitle}>ID lookup</div><pre className={s.pre}>{JSON.stringify(app.id_result, null, 2)}</pre></div>

      {msg && <p className={s.err}>{msg}</p>}
      {app.status === "pending" ? (
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button disabled={busy} onClick={() => act("approve")} className={s.btn}>Approve &amp; create church</button>
          <button disabled={busy} onClick={() => act("reject")} className={s.btnGhost}>Reject…</button>
        </div>
      ) : <p className={s.sub}>Already {app.status}.</p>}
    </>
  );
}
function Photo({ label, src }: { label: string; src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={s.photo}><div className={s.statLabel}>{label}</div>{src ? <img src={src} alt={label} className={s.photoImg} /> : <div className={s.empty}>No image</div>}</div>;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; KYC routes still present.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/kyc
git commit -m "refactor: restyle KYC pages to the admin design kit (drop dark-green inline)"
```

---

## Task 6: Restyle the public onboard form to light-minimal

**Files:**
- Modify: `src/app/onboard/[token]/onboard-form.tsx`, `src/app/onboard/[token]/page.tsx`
- Create: `src/app/onboard/[token]/onboard.module.css`

**Interfaces:** unchanged behavior; only styling moves from dark inline to a light minimal module consistent with the console.

- [ ] **Step 1: Onboard CSS**

Create `src/app/onboard/[token]/onboard.module.css`:
```css
.shell { min-height: 100vh; background: var(--bg); color: var(--ink); font-family: var(--font-sans); display: flex; justify-content: center; padding: 32px 20px 64px; }
.inner { width: 100%; max-width: 440px; }
.h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
.form { display: grid; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--ink); }
.input, .select { padding: 11px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 15px; }
.row { display: flex; gap: 8px; }
.consent { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--muted); }
.btn { padding: 13px; border: none; border-radius: var(--radius-sm); background: var(--accent); color: #fff; font-weight: 700; font-size: 15px; cursor: pointer; }
.btnGhost { padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-weight: 600; cursor: pointer; }
.err { color: #b42020; font-size: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 22px; }
```

- [ ] **Step 2: Rewrite the form to the module**

Replace the styling in `src/app/onboard/[token]/onboard-form.tsx` — swap the inline `style={...}` constants for `s.*` classes from `./onboard.module.css` (keep ALL logic/state/handlers identical). Concretely: `import s from "./onboard.module.css";`, wrap in `<div className={s.shell}><div className={s.inner}><div className={s.card}>…`, use `s.h1/s.sub/s.form/s.field/s.input/s.select/s.row/s.consent/s.btn/s.btnGhost/s.err`, and delete the old `p/lbl/inp/btn/btnGhost/Shell` inline-style consts. The `Field` helper becomes `<label className={s.field}>{label}<input className={s.input} …/></label>`.

- [ ] **Step 3: Update the page's invalid-token screen**

In `src/app/onboard/[token]/page.tsx`, replace the inline-styled invalid-token block with the light module:
```tsx
import s from "./onboard.module.css";
// ...
  if (!app) {
    return (
      <div className={s.shell}><div className={s.inner}><div className={s.card}>
        <h2 className={s.h1}>This link is invalid or expired</h2>
        <p className={s.sub}>Ask Chertt on WhatsApp to set up your church again to get a fresh link.</p>
      </div></div></div>
    );
  }
```

- [ ] **Step 4: Typecheck + full suite + build**

Run: `npx tsc --noEmit`
Run: `npx vitest run`
Run: `npm run build`
Expected: all pass; `/onboard/[token]`, `/admin`, `/admin/churches`, `/admin/churches/[id]`, `/admin/kyc`, `/admin/kyc/[id]` all compile.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboard
git commit -m "refactor: restyle onboard form to light-minimal (consistent with the console)"
```

---

## Self-Review Notes

**Spec coverage:** foundation service (overview/list/detail) → Task 1; gated routes → Task 2; design kit + layout/nav → Task 3; the three console pages → Task 4; scrap-and-restyle KYC → Task 5; scrap-and-restyle onboard → Task 6. Everything uses only the existing `:root` tokens (Vercel-minimal light); the dark-green inline UI is fully removed by Tasks 5–6.

**Placeholder scan:** Task 6 Step 2 is described as a swap rather than full code (the logic is unchanged from the existing file and repeated in full would be error-prone against the current source) — every other step carries complete code. The swap is precisely enumerated (which classes replace which consts).

**Type consistency:** the three foundation return shapes in Task 1 match their consumption in the Task-4 pages and Task-2 routes (`overview`, `churches`, `church`). `adminFetch<T>` (Task 4 Step 1) is used with the matching response generic on every page. `verificationLevel(personId) → 0|1|2` matches the `level` field rendered via `LVL[level]`.
