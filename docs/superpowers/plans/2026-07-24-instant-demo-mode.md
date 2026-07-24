# Instant Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any phone that texts the WhatsApp number gets an instant, guided, senior-pastor demo — a two-step name/church capture, their own fully-seeded demo church, a tour with tappable menus, the full church-management cycle, and the ability to try other roles.

**Architecture:** A reversible `demoModeEnabled()` flag gates a new onboarding intercept in `whatsapp-processor.ts`. For an unlinked phone it runs a two-step capture (reusing the session's existing `onboarding` discriminated union), then `provisionDemoChurch` deterministically creates + seeds a church and links the phone as `senior_pastor`. A `demoRole` session field lets testers switch effective roles. Two new create-tools (`add_member`, `create_event`) let the pastor build his church live.

**Tech Stack:** TypeScript, Next.js, Supabase (service-role), Vitest. No new dependencies.

## Global Constraints

- Reversible: all new behavior gated behind `demoModeEnabled()` (`process.env.CHERTT_DEMO_MODE !== "off"`). When off, the current guest path is unchanged.
- Deterministic: provisioning + seeding never call an LLM. All row IDs are generated client-side with `randomUUID()` and inserted explicitly (no `.select()` round-trips).
- Self-contained per tester: one org + one workspace per tester; inserts only, never deletes.
- WhatsApp-safe copy: single-asterisk `*bold*`, no markdown lists or `#` headings (matches `persona.ts`).
- Non-destructive & idempotent: a phone with an active `phone_contacts` row skips provisioning.
- All new tools that write are `mutates: true`; admin create-tools are `minRank: 4`.

---

## Task 1: Demo-mode flag

**Files:**
- Create: `src/lib/services/demo/demo-mode.ts`
- Test: `src/lib/services/demo/demo-mode.test.ts`

**Interfaces:**
- Produces: `export function demoModeEnabled(): boolean` — consumed by Tasks 5–6 (processor) and gated in tests.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/demo/demo-mode.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { demoModeEnabled } from "@/lib/services/demo/demo-mode";

describe("demoModeEnabled", () => {
  const original = process.env.CHERTT_DEMO_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.CHERTT_DEMO_MODE;
    else process.env.CHERTT_DEMO_MODE = original;
  });

  it("is on by default when the env var is unset", () => {
    delete process.env.CHERTT_DEMO_MODE;
    expect(demoModeEnabled()).toBe(true);
  });

  it("is off only when explicitly set to 'off'", () => {
    process.env.CHERTT_DEMO_MODE = "off";
    expect(demoModeEnabled()).toBe(false);
  });

  it("stays on for any other value", () => {
    process.env.CHERTT_DEMO_MODE = "on";
    expect(demoModeEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/demo/demo-mode.test.ts`
Expected: FAIL — cannot resolve `@/lib/services/demo/demo-mode`.

- [ ] **Step 3: Implement the flag**

Create `src/lib/services/demo/demo-mode.ts`:

```typescript
// Reversible master switch for Instant Demo Mode. On by default so it works
// the moment it deploys with no env change; set CHERTT_DEMO_MODE=off to
// restore normal onboarding after the sales cycle. Single source of truth so
// the flag is trivially mockable in tests.
// See docs/superpowers/specs/2026-07-24-instant-demo-mode-design.md
export function demoModeEnabled(): boolean {
  return process.env.CHERTT_DEMO_MODE !== "off";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/demo/demo-mode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/demo/demo-mode.ts src/lib/services/demo/demo-mode.test.ts
git commit -m "feat: add demoModeEnabled flag for instant demo mode"
```

---

## Task 2: Session support — `demo-onboarding` flow + `demoRole`

**Files:**
- Modify: `src/lib/services/whatsapp-session.ts`
- Create: `supabase/migrations/20260803_demo_role.sql`
- Test: `src/lib/services/whatsapp-session.test.ts` (create if absent)

**Interfaces:**
- Produces: a new `onboarding` union member `{ flow: "demo-onboarding"; step: "name" | "church"; collected: { name?: string } }` and a `demoRole?: string` field on `WhatsAppSession`, plus round-trip persistence through `demo_role`. Consumed by Tasks 5–6.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260803_demo_role.sql`:

```sql
-- Instant Demo Mode: a tester can switch their effective role to feel other
-- roles' permission walls. Persisted so the override survives between messages.
alter table public.whatsapp_sessions
  add column if not exists demo_role text;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/services/whatsapp-session.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { row: null as Record<string, unknown> | null } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) => { store.row = row; return Promise.resolve({ error: null }); },
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: store.row }) }) }),
    }),
  }),
}));

import { getSession, updateSession, resetSessions } from "@/lib/services/whatsapp-session";

const PHONE = "2348099999999";
beforeEach(() => { store.row = null; resetSessions(); });

describe("whatsapp-session demo fields", () => {
  it("round-trips a demo-onboarding flow and demoRole through the db row", async () => {
    await updateSession(PHONE, {
      onboarding: { flow: "demo-onboarding", step: "church", collected: { name: "Idris" } },
      demoRole: "finance",
    });
    expect(store.row).toMatchObject({ demo_role: "finance" });
    expect(store.row?.onboarding).toMatchObject({ flow: "demo-onboarding", step: "church" });

    resetSessions();
    const loaded = await getSession(PHONE);
    expect(loaded.demoRole).toBe("finance");
    expect(loaded.onboarding).toMatchObject({ flow: "demo-onboarding", step: "church", collected: { name: "Idris" } });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/services/whatsapp-session.test.ts`
Expected: FAIL — `demoRole` is not persisted/read (and TS: `demo-onboarding` not a valid flow).

- [ ] **Step 4: Add the union variant and `demoRole` to the type**

In `src/lib/services/whatsapp-session.ts`, inside the `onboarding?:` union on `WhatsAppSession` (after the `assign-role` variant's closing `}` at line 59, before the `;` that ends the union), add a new variant:

```typescript
    | {
        // Instant Demo Mode capture: name then church, before provisioning a
        // fully-seeded demo church. See
        // docs/superpowers/specs/2026-07-24-instant-demo-mode-design.md
        flow: "demo-onboarding";
        step: "name" | "church";
        collected: { name?: string };
      };
```

(The existing union ends `...chosenRole?: string; }; };` — insert the block so it becomes another `| { ... }` arm before the final `;`.)

Then add a `demoRole` field to `WhatsAppSession`, directly after the `activeWorkspaceId?: string;` line (line 11):

```typescript
  // Instant Demo Mode: effective-role override so a tester can feel other
  // roles' permission walls. Undefined = use the real membership role.
  demoRole?: string;
```

- [ ] **Step 5: Persist `demoRole` in the DbRow mapping**

In the same file:

Add to the `DbRow` type (after `active_workspace_id: string | null;`, line 94):

```typescript
  demo_role: string | null;
```

Add to `toSession` (after the `activeWorkspaceId: ...` line, line 118):

```typescript
    demoRole: row.demo_role ?? undefined,
```

Add to `toDbRow` (after the `active_workspace_id: ...` line, line 133):

```typescript
    demo_role: session.demoRole ?? null,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/services/whatsapp-session.test.ts`
Expected: PASS.

- [ ] **Step 7: Apply the migration and typecheck**

Run: `npx supabase db push`
Expected: applies `20260803_demo_role.sql`.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/whatsapp-session.ts src/lib/services/whatsapp-session.test.ts supabase/migrations/20260803_demo_role.sql
git commit -m "feat: session support for demo-onboarding flow and demoRole override"
```

---

## Task 3: `provisionDemoChurch` — provision + deterministic seed

**Files:**
- Create: `src/lib/services/demo/provision-demo.ts`
- Test: `src/lib/services/demo/provision-demo.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient` from `@/lib/services/supabase-server`; `PhoneLink` from `@/lib/services/whatsapp-workspace`.
- Produces: `export async function provisionDemoChurch(phone: string, personName: string, churchName: string): Promise<{ workspaceId: string; link: PhoneLink } | null>` — consumed by Task 5. Returns `null` if storage is unavailable or the core provision fails; skips + returns the existing link if the phone is already active.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/demo/provision-demo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({
  store: { inserts: [] as Array<{ table: string; rows: unknown[] }>, activeContact: null as unknown },
}));

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      insert: (rows: unknown) => {
        store.inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve({ error: null });
      },
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: store.activeContact }) }),
        }),
      }),
    }),
  }),
}));

import { provisionDemoChurch } from "@/lib/services/demo/provision-demo";

const tableInserts = (t: string) => store.inserts.filter((i) => i.table === t).flatMap((i) => i.rows);

beforeEach(() => { store.inserts.length = 0; store.activeContact = null; });

describe("provisionDemoChurch", () => {
  it("creates the church, links the phone as senior_pastor, and seeds realistic data", async () => {
    const out = await provisionDemoChurch("2348011112222", "Pastor Idris", "St Mary's Assembly");
    expect(out).not.toBeNull();
    expect(out!.link.userRole).toBe("senior_pastor");
    expect(out!.link.userName).toBe("Pastor Idris");
    expect(out!.link.workspaceName).toBe("St Mary's Assembly");

    // core provision
    expect(tableInserts("organizations").length).toBe(1);
    expect(tableInserts("workspaces")).toEqual([expect.objectContaining({ name: "St Mary's Assembly" })]);
    expect(tableInserts("branch_memberships")).toContainEqual(
      expect.objectContaining({ role: "senior_pastor", status: "active" }),
    );
    expect(tableInserts("whatsapp_phone_links")).toEqual([
      expect.objectContaining({ phone_number: "2348011112222", user_role: "senior_pastor" }),
    ]);

    // representative seed
    expect(tableInserts("giving_records").length).toBeGreaterThan(10);
    expect(tableInserts("branch_memberships").length).toBeGreaterThan(5); // pastor + seeded members
    expect(tableInserts("workflow_requests").length).toBe(2); // pending approvals
    expect(tableInserts("event_records").length).toBe(3);
  });

  it("skips provisioning when the phone is already an active contact", async () => {
    store.activeContact = { person_id: "existing-person" };
    const out = await provisionDemoChurch("2348011112222", "Idris", "X");
    expect(out).toBeNull();
    expect(tableInserts("workspaces").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/demo/provision-demo.test.ts`
Expected: FAIL — cannot resolve `provision-demo`.

- [ ] **Step 3: Implement `provisionDemoChurch`**

Create `src/lib/services/demo/provision-demo.ts`:

```typescript
// Instant Demo Mode: deterministically create + seed a full, believable church
// for a tester and link their phone as senior_pastor. No LLM calls; every row
// ID is generated here and inserted explicitly, so setup is reliable and the
// resulting church looks real in every report and menu. Mirrors the proven
// scratchpad seed scripts. See
// docs/superpowers/specs/2026-07-24-instant-demo-mode-design.md
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

type Db = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

const iso = (ms: number) => new Date(ms).toISOString();
const daysAgo = (n: number) => iso(Date.now() - n * 86_400_000);
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "church";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// Best-effort decorative insert: one failing seed table must never abort setup.
async function seed(db: Db, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  try { await db.from(table).insert(rows); } catch { /* decorative — ignore */ }
}

export async function provisionDemoChurch(
  phone: string,
  personName: string,
  churchName: string,
): Promise<{ workspaceId: string; link: PhoneLink } | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const name = personName.trim() || "Pastor";
  const church = churchName.trim() || "Grace Chapel (Demo)";

  // Idempotency: if this phone already has an active contact, don't double-seed.
  const { data: existing } = await db
    .from("phone_contacts")
    .select("person_id")
    .eq("phone_number", phone)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return null;

  const orgId = randomUUID();
  const workspaceId = randomUUID();
  const personId = randomUUID();
  const slug = slugify(church);

  // ── Core provision — these MUST succeed or the church isn't usable. ──
  const core = await db.from("organizations").insert({
    id: orgId, name: church, status: "active",
    requested_by_phone: phone, requested_by_name: name, requested_city: "Lagos", requested_size: "300",
  });
  if (core.error) return null;

  const wsRes = await db.from("workspaces").insert({
    id: workspaceId, slug, name: church, legal_name: church, city: "Lagos",
    timezone: "Africa/Lagos", organization_id: orgId,
  });
  if (wsRes.error) return null;

  await db.from("people").insert({ id: personId, full_name: name, birth_day: 15, birth_month: 6 });
  await db.from("phone_contacts").insert({
    phone_number: phone, person_id: personId, status: "active", verified_at: new Date().toISOString(),
  });
  const memRes = await db.from("branch_memberships").insert({
    id: randomUUID(), person_id: personId, workspace_id: workspaceId, role: "senior_pastor", status: "active",
  });
  if (memRes.error) return null;
  await db.from("organization_admins").insert({ organization_id: orgId, phone_number: phone, person_id: personId });
  const linkRes = await db.from("whatsapp_phone_links").insert({
    phone_number: phone, workspace_id: workspaceId, workspace_slug: slug,
    workspace_name: church, user_name: name, user_role: "senior_pastor",
  });
  if (linkRes.error) return null;

  // ── Decorative catalogs ──
  await seed(db, "giving_categories", ["Tithes", "Offerings", "Building Fund"].map((n) => ({ workspace_id: workspaceId, name: n })));
  await seed(db, "ministry_units", ["Choir", "Ushering", "Media", "Children's Ministry"].map((n) => ({ workspace_id: workspaceId, name: n })));

  // ── Seeded members ──
  const members = [
    { name: "Pastor Emmanuel Adeyemi", role: "pastor", bd: 14, bm: 3 },
    { name: "Blessing Okafor", role: "finance", bd: 2, bm: 8 },
    { name: "Grace Nwosu", role: "secretary", bd: 21, bm: 11 },
    { name: "Samuel Eze", role: "dept_leader", bd: 9, bm: 5 },
    { name: "Deborah Okon", role: "dept_leader", bd: 30, bm: 1 },
    { name: "Daniel Bello", role: "children", bd: 17, bm: 7 },
    { name: "Faith Adeyemi", role: "member", bd: 25, bm: 7 },
    { name: "Joshua Obi", role: "member", bd: 4, bm: 2 },
    { name: "Mary Ibrahim", role: "member", bd: 12, bm: 9 },
    { name: "Peter Okafor", role: "member", bd: 19, bm: 4 },
    { name: "Esther Musa", role: "member", bd: 7, bm: 12 },
    { name: "John Chukwu", role: "member", bd: 28, bm: 6 },
  ];
  const memberIds = members.map(() => randomUUID());
  await seed(db, "people", members.map((m, i) => ({ id: memberIds[i], full_name: m.name, birth_day: m.bd, birth_month: m.bm })));
  await seed(db, "branch_memberships", members.map((m, i) => ({
    id: randomUUID(), person_id: memberIds[i], workspace_id: workspaceId, role: m.role, status: "active",
  })));

  // ── Giving: last month (8) + this month (14), positive delta ──
  const givers = members.map((m) => m.name).concat([name]);
  const types = ["tithe", "offering", "donation", "pledge"];
  const giving: Record<string, unknown>[] = [];
  const lastAmts = [5000, 10000, 2000, 20000, 3500, 15000, 7500, 25000];
  lastAmts.forEach((amt, i) => giving.push({
    workspace_id: workspaceId, donor_name: givers[i % givers.length], amount: amt,
    giving_type: types[i % 4], channel: "transfer", church_name: church, created_at: daysAgo(38 - i * 2),
  }));
  const thisAmts = [10000, 5000, 20000, 3000, 50000, 7500, 12000, 2500, 30000, 8000, 15000, 4000, 25000, 6000];
  thisAmts.forEach((amt, i) => giving.push({
    workspace_id: workspaceId, donor_name: givers[i % givers.length], amount: amt,
    giving_type: types[i % 4], channel: "transfer", church_name: church, created_at: daysAgo(Math.max(0, 20 - i)),
  }));
  await seed(db, "giving_records", giving);

  // ── Prayer, pastoral care, first-timers ──
  await seed(db, "prayer_requests", [
    { workspace_id: workspaceId, requester_name: "Mary Ibrahim", request: "Please pray for safe delivery, my baby is due next month.", status: "open", created_at: daysAgo(2) },
    { workspace_id: workspaceId, requester_name: "Joshua Obi", request: "Job interview on Monday — pray for favour.", status: "open", created_at: daysAgo(1) },
    { workspace_id: workspaceId, requester_name: "Esther Musa", request: "My mother's health, she's in hospital.", status: "praying", created_at: daysAgo(4) },
    { workspace_id: workspaceId, requester_name: "Peter Okafor", request: "Travelling mercies for the family this weekend.", status: "open", created_at: daysAgo(0) },
  ]);
  await seed(db, "pastoral_care_requests", [
    { workspace_id: workspaceId, requester_name: "Faith Adeyemi", category: "marriage", details: "Would like marriage counselling before the wedding.", status: "open", created_at: daysAgo(3) },
    { workspace_id: workspaceId, requester_name: "John Chukwu", category: "bereavement", details: "Lost his father, needs a pastor to visit.", status: "open", created_at: daysAgo(1) },
  ]);
  await seed(db, "first_timers", [
    { workspace_id: workspaceId, name: "Chidera Okeke", phone: "2348100000021", invited_by: "Grace Nwosu", follow_up_status: "new", created_at: daysAgo(2) },
    { workspace_id: workspaceId, name: "Tunde Bakare", phone: "2348100000022", invited_by: "Samuel Eze", follow_up_status: "contacted", created_at: daysAgo(9) },
    { workspace_id: workspaceId, name: "Amaka Nnaji", phone: "2348100000023", invited_by: "Deborah Okon", follow_up_status: "new", created_at: daysAgo(2) },
    { workspace_id: workspaceId, name: "Ibrahim Sani", phone: null, invited_by: "Peter Okafor", follow_up_status: "joined", created_at: daysAgo(16) },
  ]);

  // ── Events (3) + registrations ──
  const eventIds = [randomUUID(), randomUUID(), randomUUID()];
  await seed(db, "event_records", [
    { id: eventIds[0], workspace_id: workspaceId, title: "Youth Night", venue: "Main Auditorium", event_date: dateOnly(Date.now() + 3 * 86_400_000), guests_expected: 80 },
    { id: eventIds[1], workspace_id: workspaceId, title: "Marriage Enrichment Seminar", venue: "Fellowship Hall", event_date: dateOnly(Date.now() + 10 * 86_400_000), guests_expected: 40 },
    { id: eventIds[2], workspace_id: workspaceId, title: "Workers' Retreat", venue: "Camp Ground, Ibadan", event_date: dateOnly(Date.now() + 24 * 86_400_000), guests_expected: 120 },
  ]);
  await seed(db, "event_registrations", [
    { workspace_id: workspaceId, event_id: eventIds[0], event_title: "Youth Night", attendee_name: "Joshua Obi", status: "registered" },
    { workspace_id: workspaceId, event_id: eventIds[0], event_title: "Youth Night", attendee_name: "Faith Adeyemi", status: "registered" },
    { workspace_id: workspaceId, event_id: eventIds[1], event_title: "Marriage Enrichment Seminar", attendee_name: "Peter Okafor", status: "registered" },
  ]);

  // ── Departments, Sundays, kids, FAQs, volunteers, journeys ──
  await seed(db, "department_memberships", [
    { workspace_id: workspaceId, unit_name: "Choir", member_name: "Faith Adeyemi", status: "pending", created_at: daysAgo(1) },
    { workspace_id: workspaceId, unit_name: "Media", member_name: "Joshua Obi", status: "pending", created_at: daysAgo(2) },
    { workspace_id: workspaceId, unit_name: "Ushering", member_name: "Mary Ibrahim", status: "approved", created_at: daysAgo(20) },
    { workspace_id: workspaceId, unit_name: "Choir", member_name: "Esther Musa", status: "approved", created_at: daysAgo(30) },
  ]);
  const sundays = [
    { d: 5, ad: 142, ch: 34, ft: 5, sv: 3, off: 186500, topic: "Faith that moves mountains" },
    { d: 12, ad: 128, ch: 30, ft: 3, sv: 1, off: 154000, topic: "The generous heart" },
    { d: 19, ad: 156, ch: 41, ft: 7, sv: 4, off: 210000, topic: "New beginnings" },
    { d: 26, ad: 119, ch: 28, ft: 2, sv: 0, off: 132500, topic: "Walking in love" },
  ];
  await seed(db, "services", sundays.map((s) => ({
    workspace_id: workspaceId, service_date: dateOnly(Date.now() - s.d * 86_400_000), service_type: "Sunday Service",
    title: s.topic, preacher: "Pastor Emmanuel Adeyemi", message_topic: s.topic,
    attendance_adults: s.ad, attendance_children: s.ch, first_timers_count: s.ft, salvations_count: s.sv,
    offering_total: s.off, status: "closed", created_by_name: "Grace Nwosu", created_at: daysAgo(s.d),
  })));
  await seed(db, "child_checkins", [
    { workspace_id: workspaceId, child_name: "Zoe Adeyemi", age: 5, allergies: "Peanuts", guardian_name: "Faith Adeyemi", pickup_code: "482913", status: "checked_in", service_label: "Children's Church" },
    { workspace_id: workspaceId, child_name: "Caleb Okafor", age: 8, allergies: null, guardian_name: "Blessing Okafor", pickup_code: "730164", status: "checked_in", service_label: "Children's Church" },
  ]);
  await seed(db, "toolkit_knowledge_articles", [
    { workspace_id: workspaceId, type: "faq", title: "What time is Sunday service?", body: "Two services: First service 8:00am, Second service 10:30am. Children's Church runs during both.", tags: [] },
    { workspace_id: workspaceId, type: "faq", title: "What is the church account number?", body: `${church} — GTBank 0123456789. Use your full name as reference.`, tags: [] },
    { workspace_id: workspaceId, type: "faq", title: "Where is the church located?", body: "12 Grace Avenue, Lekki Phase 1, Lagos. Parking on the left of the main gate.", tags: [] },
    { workspace_id: workspaceId, type: "faq", title: "How do I join a department?", body: "Tell me which one — Choir, Ushering, Media or Children's Ministry — and I'll register your interest.", tags: [] },
  ]);
  await seed(db, "volunteer_needs", [
    { workspace_id: workspaceId, title: "Ushers for Youth Night", when_label: "This Friday, 5pm", slots_needed: 6, status: "open", created_by_name: "Deborah Okon", created_at: daysAgo(1) },
  ]);
  await seed(db, "life_journeys", [
    { workspace_id: workspaceId, journey_type: "marriage_prep", person_name: "Faith Adeyemi", status: "active", created_at: daysAgo(6) },
    { workspace_id: workspaceId, journey_type: "discipleship", person_name: "Ibrahim Sani", status: "active", created_at: daysAgo(12) },
  ]);

  // ── Status-view fuel: pending approvals + an open issue ──
  await seed(db, "workflow_requests", [
    { workspace_id: workspaceId, module_key: "church", request_type: "reimbursement", title: "Diesel for generator", description: "Fuel for Sunday service power.", requester_name: "Samuel Eze", amount: 45000, status: "pending", created_at: daysAgo(1) },
    { workspace_id: workspaceId, module_key: "church", request_type: "reimbursement", title: "Children's Church materials", description: "Craft supplies for July.", requester_name: "Daniel Bello", amount: 18500, status: "pending", created_at: daysAgo(2) },
  ]);
  await seed(db, "toolkit_issue_reports", [
    { workspace_id: workspaceId, title: "AC in main auditorium not cooling", area: "Facilities", severity: "medium", status: "pending", media_count: 0, reported_by: "Grace Nwosu", created_at: daysAgo(2) },
  ]);

  const link: PhoneLink = {
    phoneNumber: phone, userId: null, workspaceId, workspaceSlug: slug,
    workspaceName: church, userName: name, userRole: "senior_pastor",
  };
  return { workspaceId, link };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/demo/provision-demo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `PhoneLink` has fields beyond those set, copy its exact shape from `whatsapp-workspace.ts:8`.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/demo/provision-demo.ts src/lib/services/demo/provision-demo.test.ts
git commit -m "feat: provisionDemoChurch — deterministic full seed + senior_pastor link"
```

---

## Task 4: New create-tools — `add_member` and `create_event`

**Files:**
- Modify: `src/lib/services/agent/church-tools.ts` (add `add_member`)
- Modify: `src/lib/services/agent/community-tools.ts` (add `create_event`)
- Test: `src/lib/services/agent/create-tools.test.ts`

**Interfaces:**
- Consumes: `AgentTool`, `AgentContext` from `@/lib/services/agent/tools`; `getSupabaseServerClient`.
- Produces: two tools named `add_member` (in `CHURCH_TOOLS`) and `create_event` (in `COMMUNITY_TOOLS`), auto-registered because `runtime.ts` already spreads both arrays into `AGENT_TOOLS`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/agent/create-tools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { inserts: [] as Array<{ table: string; row: Record<string, unknown> }> } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => { store.inserts.push({ table, row }); return Promise.resolve({ error: null }); },
    }),
  }),
}));

import { CHURCH_TOOLS } from "@/lib/services/agent/church-tools";
import { COMMUNITY_TOOLS } from "@/lib/services/agent/community-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "ws1", role: "senior_pastor", userName: "Pastor", phone: "234800", personId: "p1" };
const addMember = CHURCH_TOOLS.find((t) => t.name === "add_member")!;
const createEvent = COMMUNITY_TOOLS.find((t) => t.name === "create_event")!;

beforeEach(() => { store.inserts.length = 0; });

describe("add_member", () => {
  it("is leader-gated", () => { expect(addMember.minRank).toBe(4); expect(addMember.mutates).toBe(true); });

  it("creates a person and an active membership with the resolved role", async () => {
    const out = (await addMember.handler({ name: "Sister Grace", role: "usher" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(store.inserts.map((i) => i.table)).toEqual(["people", "branch_memberships"]);
    expect(store.inserts[1].row).toMatchObject({ workspace_id: "ws1", role: "dept_leader", status: "active" });
    expect(out.message).toContain("Sister Grace");
  });

  it("defaults an unknown role to member", async () => {
    await addMember.handler({ name: "Ada", role: "wizard" }, ctx);
    expect(store.inserts[1].row).toMatchObject({ role: "member" });
  });

  it("needs a name", async () => {
    const out = (await addMember.handler({}, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});

describe("create_event", () => {
  it("is leader-gated", () => { expect(createEvent.minRank).toBe(4); expect(createEvent.mutates).toBe(true); });

  it("inserts an event with a default venue and date", async () => {
    const out = (await createEvent.handler({ title: "Youth Night" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(store.inserts[0].table).toBe("event_records");
    expect(store.inserts[0].row).toMatchObject({ workspace_id: "ws1", title: "Youth Night", venue: "Main Auditorium" });
    expect(String(store.inserts[0].row.event_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.message).toContain("Youth Night");
  });

  it("needs a title", async () => {
    const out = (await createEvent.handler({}, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/agent/create-tools.test.ts`
Expected: FAIL — `add_member`/`create_event` not found (`.find` returns undefined).

- [ ] **Step 3: Implement `add_member`**

In `src/lib/services/agent/church-tools.ts`, ensure `randomUUID` is imported (add `import { randomUUID } from "node:crypto";` at the top if absent). Add this tool object to the `CHURCH_TOOLS` array (append before the closing `];`):

```typescript
  {
    name: "add_member",
    description:
      "Add a new person to the church and give them a role. Use when a leader says things like 'add Sister Grace as an usher' or 'register John as a member'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The person's full name" },
        role: { type: "string", description: "Their role: member, usher, finance, secretary, children, or pastor (optional; defaults to member)" },
        phone: { type: "string", description: "Their WhatsApp number (optional)" },
      },
      required: ["name"],
    },
    minRank: 4, // leaders add people
    mutates: true,
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "Who should I add? Tell me their name." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      // Friendly words → internal role slugs; anything unknown becomes a member.
      const roleMap: Record<string, string> = {
        member: "member", usher: "dept_leader", ushering: "dept_leader", leader: "dept_leader",
        finance: "finance", treasurer: "finance", secretary: "secretary",
        children: "children", "children's": "children", pastor: "pastor",
      };
      const asked = String(args.role ?? "").trim().toLowerCase();
      const role = roleMap[asked] ?? "member";
      const personId = randomUUID();
      const p = await db.from("people").insert({ id: personId, full_name: name });
      if (p.error) return { error: p.error.message };
      const m = await db.from("branch_memberships").insert({
        id: randomUUID(), person_id: personId, workspace_id: ctx.workspaceId, role, status: "active",
      });
      if (m.error) return { error: m.error.message };
      return { ok: true, message: `✅ Added *${name}* to the church${role !== "member" ? ` as ${role.replace("dept_leader", "an usher/leader")}` : ""}.` };
    },
  },
```

- [ ] **Step 4: Implement `create_event`**

In `src/lib/services/agent/community-tools.ts`, ensure `randomUUID` is imported (it already is, line 6). Add this tool object to the `COMMUNITY_TOOLS` array (append before the closing `];`):

```typescript
  {
    name: "create_event",
    description:
      "Create a new church event or programme. Use when a leader says 'add a Youth Night this Friday' or 'schedule a workers' retreat'. After creating, members can register for it.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The event's name" },
        venue: { type: "string", description: "Where it's held (optional; defaults to Main Auditorium)" },
        date: { type: "string", description: "Date as YYYY-MM-DD if known (optional; defaults to next Sunday)" },
        expected: { type: "number", description: "How many people are expected (optional)" },
      },
      required: ["title"],
    },
    minRank: 4, // leaders create events
    mutates: true,
    handler: async (args, ctx) => {
      const title = String(args.title ?? "").trim();
      if (!title) return { error: "What's the event called?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      // Use the given date if it's a valid YYYY-MM-DD, else default to next Sunday.
      const raw = String(args.date ?? "").trim();
      let eventDate: string;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))) {
        eventDate = raw;
      } else {
        const d = new Date();
        d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // next Sunday
        eventDate = d.toISOString().slice(0, 10);
      }
      const expected = Number(args.expected);
      const { error } = await db.from("event_records").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        title,
        venue: String(args.venue ?? "").trim() || "Main Auditorium",
        event_date: eventDate,
        guests_expected: Number.isFinite(expected) && expected > 0 ? Math.floor(expected) : 0,
      });
      if (error) return { error: error.message };
      return { ok: true, message: `✅ *${title}* is on the calendar for ${eventDate}. Members can now register for it.` };
    },
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/services/agent/create-tools.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/agent/church-tools.ts src/lib/services/agent/community-tools.ts src/lib/services/agent/create-tools.test.ts
git commit -m "feat: add_member and create_event tools so pastors build their church live"
```

---

## Task 5: Onboarding intercept — capture → provision → tour

**Files:**
- Modify: `src/lib/services/whatsapp-processor.ts`
- Test: `src/lib/services/whatsapp-processor.test.ts`

**Interfaces:**
- Consumes: `demoModeEnabled` (Task 1); `provisionDemoChurch` (Task 3); existing `getSession`/`updateSession`/`sendTextMessage`/`sendInteractiveButtons`.
- Produces: a private `handleDemoOnboarding(from, session, link, trimmed): Promise<boolean>` (returns true when it consumed the turn), called at the top of `processWhatsAppMessage` before the guest path.

- [ ] **Step 1: Write the failing tests**

The test file's `PHONE` (`2348012345678`) is unlinked (no membership mock), so it drives the demo path. Add inside `describe("processWhatsAppMessage", ...)`:

```typescript
  it("demo mode: first contact asks for the tester's name", async () => {
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "hi" });
    expect(mockRun).not.toHaveBeenCalled();
    const [, text] = mockSend.mock.calls[0] as [string, string];
    expect(text).toMatch(/what's your name/i);
  });

  it("demo mode: captures name then church, then provisions and tours", async () => {
    const provision = await import("@/lib/services/demo/provision-demo");
    const spy = vi.spyOn(provision, "provisionDemoChurch").mockResolvedValue({
      workspaceId: "ws-demo",
      link: { phoneNumber: PHONE, userId: null, workspaceId: "ws-demo", workspaceSlug: "st-marys", workspaceName: "St Mary's", userName: "Idris", userRole: "senior_pastor" },
    });

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "hi" });       // → ask name
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "Idris" });     // → ask church
    const [, churchPrompt] = mockSend.mock.calls[1] as [string, string];
    expect(churchPrompt).toMatch(/church/i);

    await processWhatsAppMessage({ from: PHONE, type: "text", text: "St Mary's" }); // → provision + tour
    expect(spy).toHaveBeenCalledWith(PHONE, "Idris", "St Mary's");
    // tour goes out with buttons
    expect(mockButtons).toHaveBeenCalled();
    const [, tourText] = mockButtons.mock.calls[mockButtons.mock.calls.length - 1] as [string, string];
    expect(tourText).toContain("St Mary's");
  });

  it("demo mode OFF: unlinked phone still hits the guest welcome", async () => {
    process.env.CHERTT_DEMO_MODE = "off";
    try {
      await processWhatsAppMessage({ from: PHONE, type: "text", text: "hi" });
      const [, text] = mockSend.mock.calls[0] as [string, string];
      expect(text).toContain("set up my church");
    } finally {
      delete process.env.CHERTT_DEMO_MODE;
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: FAIL — demo onboarding not wired; first contact currently sends the guest welcome, not a name prompt.

- [ ] **Step 3: Add imports**

In `src/lib/services/whatsapp-processor.ts`, add near the other service imports:

```typescript
import { demoModeEnabled } from "@/lib/services/demo/demo-mode";
import { provisionDemoChurch } from "@/lib/services/demo/provision-demo";
```

- [ ] **Step 4: Implement `handleDemoOnboarding`**

Add this function directly above `buildWorkspaceWelcome` (near the other welcome builders):

```typescript
// Instant Demo Mode: for an unlinked phone, run a 2-step name→church capture,
// then provision a fully-seeded demo church and send a guided tour. Returns
// true when it consumed the turn. Reuses the session's onboarding union so no
// new state field is needed. See
// docs/superpowers/specs/2026-07-24-instant-demo-mode-design.md
async function handleDemoOnboarding(
  from: string,
  session: WhatsAppSession,
  trimmed: string,
): Promise<boolean> {
  const ob = session.onboarding;

  // Not yet started → ask for the name.
  if (!ob || ob.flow !== "demo-onboarding") {
    await updateSession(from, { welcomed: true, onboarding: { flow: "demo-onboarding", step: "name", collected: {} } });
    await sendTextMessage(from, "👋 I'm *Chertt* — I'll set you up in 10 seconds. First, what's your name?");
    return true;
  }

  if (ob.step === "name") {
    if (!trimmed) { await sendTextMessage(from, "What's your name? 🙂"); return true; }
    await updateSession(from, { onboarding: { flow: "demo-onboarding", step: "church", collected: { name: trimmed } } });
    await sendTextMessage(from, `Lovely to meet you, *${trimmed}*! And what's your church called?`);
    return true;
  }

  // step === "church"
  if (!trimmed) { await sendTextMessage(from, "What's your church called?"); return true; }
  const personName = ob.collected.name ?? "Pastor";
  await sendTextMessage(from, `🎉 Setting up *${trimmed}* for you — one sec…`);
  const result = await provisionDemoChurch(from, personName, trimmed).catch(() => null);
  await updateSession(from, { onboarding: undefined });
  if (!result) {
    await sendTextMessage(from, "Hmm, something hiccuped setting up. Say *hi* to try again.");
    return true;
  }
  await updateSession(from, { activeWorkspaceId: result.workspaceId, userName: personName });
  await sendDemoTour(from, result.link);
  return true;
}
```

- [ ] **Step 5: Implement `sendDemoTour`**

Add directly below `handleDemoOnboarding`:

```typescript
// The guided-tour welcome after a demo church is provisioned: warm framing +
// the tappable starter buttons the tester loves. Falls back to text.
async function sendDemoTour(from: string, link: PhoneLink): Promise<void> {
  const text = [
    `You're all set, *${link.userName}* — welcome to *${link.workspaceName}*! 🙏`,
    "",
    "You're the *senior pastor* here, so you can run the whole church from this chat. Try things like:",
    "💰 “give ₦5,000 tithe”",
    "📊 “how much giving this month?”",
    "🙏 “please pray for my mum”",
    "👶 “check in my daughter, age 6”",
    "➕ “add Sister Grace as an usher”",
    "",
    "Tap a button below, type *menu* anytime to see everything, or say *try another role* to explore as a member. 👇",
  ].join("\n");
  try {
    await sendInteractiveButtons(from, text, [
      { id: "help_give", title: "Give" },
      { id: "help_prayer", title: "Prayer" },
      { id: "demo_menu", title: "Show me around" },
    ], "Welcome 🙏");
  } catch {
    await sendTextMessage(from, text);
  }
}
```

- [ ] **Step 6: Wire the intercept into `processWhatsAppMessage`**

Find the welcome block (around line 679):

```typescript
  if (!session.welcomed) {
    await updateSession(from, { welcomed: true });
    if (link) await sendWorkspaceWelcome(from, link);
    else await sendTextMessage(from, buildGuestWelcome());
    if (shouldStopAfterWelcome(message, trimmed)) return;
  }
```

Replace it with (demo intercept first, for unlinked phones):

```typescript
  // Instant Demo Mode: an unlinked phone gets the guided demo instead of the
  // guest nudge. Runs the capture→provision→tour flow; consumes the turn while
  // in progress. A text message drives it; non-text first contact still welcomes.
  if (!link && demoModeEnabled() && (message.type === "text" || session.onboarding?.flow === "demo-onboarding")) {
    if (await handleDemoOnboarding(from, session, trimmed)) return;
  }

  if (!session.welcomed) {
    await updateSession(from, { welcomed: true });
    if (link) await sendWorkspaceWelcome(from, link);
    else await sendTextMessage(from, buildGuestWelcome());
    if (shouldStopAfterWelcome(message, trimmed)) return;
  }
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: PASS, including the three new tests. (If the pre-existing "sends welcome message on first contact" test now sees the name prompt instead of the guest welcome, update that test to set `CHERTT_DEMO_MODE=off` in its body — the guest-welcome behavior it asserts is the demo-off path.)

- [ ] **Step 8: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/whatsapp-processor.ts src/lib/services/whatsapp-processor.test.ts
git commit -m "feat: instant-demo onboarding — capture name+church, provision, guided tour"
```

---

## Task 6: Full menu + role switching

**Files:**
- Modify: `src/lib/services/whatsapp-processor.ts`
- Test: `src/lib/services/whatsapp-processor.test.ts`

**Interfaces:**
- Consumes: `sendInteractiveList` (add to the `@/lib/services/whatsapp` import); `roleLabel` (already imported); `agentCtx` (extend to take `demoRole`).
- Produces: `demo_menu`/`role:*` button handling and a `switch to <role>` matcher; `agentCtx` now applies `session.demoRole`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe("processWhatsAppMessage", ...)`. These reuse the provisioned demo link via a session that's already linked — simplest is to drive the menu/role text after mocking a link. Since `PHONE` is unlinked, assert on the button/list sends and the role-switch acknowledgement (which don't require a real link):

```typescript
  it("demo menu: 'menu' opens the interactive list", async () => {
    // Put the phone past onboarding so 'menu' isn't captured as a church name.
    await updateSession(PHONE, { welcomed: true, onboarding: undefined, activeWorkspaceId: "ws-demo" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "menu" });
    expect(mockList).toHaveBeenCalled();
    const [, , , rows] = mockList.mock.calls[0] as [string, string, string, Array<{ id: string; title: string }>];
    expect(rows.some((r) => r.id === "role:menu")).toBe(true);
    expect(rows.some((r) => r.id === "rpt:giving")).toBe(true);
  });

  it("role switch: 'switch to member' sets demoRole and confirms", async () => {
    await updateSession(PHONE, { welcomed: true, onboarding: undefined, activeWorkspaceId: "ws-demo" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "switch to member" });
    const session = await getSession(PHONE);
    expect(session.demoRole).toBe("member");
    const [, text] = mockSend.mock.calls[mockSend.mock.calls.length - 1] as [string, string];
    expect(text).toMatch(/now a member/i);
  });

  it("role switch: 'back to pastor' clears the override", async () => {
    await updateSession(PHONE, { welcomed: true, onboarding: undefined, activeWorkspaceId: "ws-demo", demoRole: "member" });
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "back to pastor" });
    const session = await getSession(PHONE);
    expect(session.demoRole).toBeUndefined();
  });
```

Add a `mockList` alongside the existing `mockButtons` near the top of the test file (find the `sendInteractiveButtons`/`sendInteractiveList` mock in the `vi.mock("@/lib/services/whatsapp", ...)` block and expose it):

```typescript
const mockList = sendInteractiveList as ReturnType<typeof vi.fn>;
```

(Import `sendInteractiveList` in the test's import list if not already present.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: FAIL — no `demo_menu`/role handling; `menu`/`switch to member` fall through to the agent or guest path.

- [ ] **Step 3: Add the `sendInteractiveList` import**

In `src/lib/services/whatsapp-processor.ts`, add `sendInteractiveList` to the existing `@/lib/services/whatsapp` import (line 10):

```typescript
import { sendTextMessage, sendInteractiveButtons, sendInteractiveList, downloadMedia } from "@/lib/services/whatsapp";
```

(If already present, skip.)

- [ ] **Step 4: Implement the menu + role helpers**

Add these helpers near `sendDemoTour`:

```typescript
// The five roles a tester can wear, in menu order. First is the reset.
const DEMO_ROLES: Array<{ id: string; label: string; note: string }> = [
  { id: "pastor", label: "Senior pastor (full access)", note: "You're back to *senior pastor* — full access to everything." },
  { id: "finance", label: "Finance officer", note: "You're now on *finance* — you can see giving and approvals, but not admin-only settings." },
  { id: "member", label: "Church member", note: "You're now a *member* — you can give, ask for prayer, register for events and check a child in. Approvals and reports are hidden." },
  { id: "dept_leader", label: "Usher / department leader", note: "You're now a *department leader* — you can manage your unit and check children in." },
  { id: "children", label: "Children's team", note: "You're now on the *children's team* — you can check kids in and release them to guardians." },
];

async function sendDemoMenu(from: string): Promise<void> {
  const rows: InteractiveListRow[] = [
    { id: "help_give", title: "Give", description: "Give a tithe or offering" },
    { id: "help_prayer", title: "Ask for prayer", description: "Submit a prayer request" },
    { id: "help_checkin", title: "Check in a child", description: "Get a pickup code" },
    { id: "demo_event", title: "Register for an event", description: "See what's coming up" },
    { id: "rpt:giving", title: "Giving this month", description: "Totals and recent gifts" },
    { id: "rpt:overview", title: "Church at a glance", description: "Attendance, approvals, issues" },
    { id: "role:menu", title: "Try another role", description: "Experience Chertt as any role" },
  ];
  try {
    await sendInteractiveList(from, "Here's everything I can do for you. Pick one, or just tell me what you need. 🙏", "Open menu", rows, "Chertt menu");
  } catch {
    await sendTextMessage(from, "Try: give ₦5,000 tithe · ask for prayer · check in a child · how much giving this month · try another role");
  }
}

async function sendRoleMenu(from: string): Promise<void> {
  const rows: InteractiveListRow[] = DEMO_ROLES.map((r) => ({ id: `role:${r.id}`, title: r.label }));
  try {
    await sendInteractiveList(from, "Which role do you want to feel? I'll switch you instantly — you'll hit the same permission walls a real person in that role would.", "Pick a role", rows, "Try another role");
  } catch {
    await sendTextMessage(from, "Say: switch to member · switch to finance · switch to usher · switch to children · back to pastor");
  }
}

// Applies a role switch (from a button id "role:<x>" or a text command) and
// confirms what changed. Returns true if it handled the message.
async function handleRoleSwitch(from: string, target: string): Promise<boolean> {
  const t = target.trim().toLowerCase();
  const back = /^(pastor|senior|back)/.test(t);
  const match = DEMO_ROLES.find((r) => t.includes(r.id) || (r.id === "dept_leader" && t.includes("usher")));
  const chosen = back ? DEMO_ROLES[0] : match;
  if (!chosen) return false;
  await updateSession(from, { demoRole: chosen.id === "pastor" ? undefined : chosen.id });
  await sendTextMessage(from, chosen.note + "\n\nSay *back to pastor* anytime, or *menu* to see options.");
  return true;
}
```

Add the `InteractiveListRow` type import to the `@/lib/services/whatsapp` import line (Step 3), i.e. `import { ..., type InteractiveListRow } from "@/lib/services/whatsapp";`.

- [ ] **Step 5: Route the button ids**

In `handleButtonReply`, add near the top (after the `help`/`confirm`/`cancel` handlers, before the `rpt:` blocks):

```typescript
  if (buttonId === "demo_menu") { await sendDemoMenu(from); return; }
  if (buttonId === "role:menu") { await sendRoleMenu(from); return; }
  if (buttonId.startsWith("role:")) { await handleRoleSwitch(from, buttonId.slice(5)); return; }
  if (buttonId === "demo_event") {
    await sendTextMessage(from, "What would you like to register for? Say the event name, or ask *what events are coming up?* 🎟️");
    return;
  }
```

- [ ] **Step 6: Route the text triggers**

Find the status-command line (around line 965):

```typescript
  if (/^(status|my status|show status|dashboard|summary)$/i.test(trimmed)) { await handleStatusCommand(from, session, link); return; }
```

Add directly below it:

```typescript
  // Instant Demo Mode text shortcuts: the full menu and role switching.
  if (/^(menu|show me around|options)$/i.test(trimmed)) { await sendDemoMenu(from); return; }
  if (/^try another role$/i.test(trimmed)) { await sendRoleMenu(from); return; }
  {
    const sw = trimmed.match(/^(?:switch to|become(?: a)?|be(?: a)?|act as)\s+(.+)$/i) || (/^back to pastor$/i.test(trimmed) ? [null, "pastor"] as unknown as RegExpMatchArray : null);
    if (sw && (await handleRoleSwitch(from, sw[1]))) return;
  }
```

- [ ] **Step 7: Apply `demoRole` to the agent context**

Change `agentCtx` (line 683) to accept and apply the override:

```typescript
function agentCtx(link: PhoneLink, from: string, personId?: string, demoRole?: string): AgentContext {
  return { workspaceId: link.workspaceId, role: (demoRole ?? link.userRole) as Role, userName: link.userName, phone: from, personId };
}
```

Update its four call sites (lines 617, 1018, 1040, 1066) to pass the override, e.g.:

```typescript
    if (await dispatchToAgent(from, transcript, agentCtx(link, from, personId, session.demoRole))) return;
```

For the call site at line 617 (inside `processVoiceOrText`/helper that may use `freshSession`), pass whichever session variable is in scope (`freshSession.demoRole` or `session.demoRole`). Each call site already has a session object; use its `.demoRole`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: PASS, including the three new tests.

- [ ] **Step 9: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/lib/services/whatsapp-processor.ts src/lib/services/whatsapp-processor.test.ts
git commit -m "feat: demo full menu (list) + role switching with demoRole override"
```

---

## Task 7: End-to-end verification + ship

**Files:** none (verification + deploy)

- [ ] **Step 1: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass (334 existing + new), no type errors.

- [ ] **Step 2: Confirm the migration is applied**

Run: `npx supabase migration list`
Expected: `20260803_demo_role` shows as applied locally and remotely. If not, run `npx supabase db push`.

- [ ] **Step 3: Push (deploys via Vercel)**

```bash
git push origin main
```

- [ ] **Step 4: Live smoke test (manual, from a phone NOT yet linked)**

Text the number and verify the flow:
1. "hi" → asks your name.
2. reply a name → asks your church.
3. reply a church → "Setting up…" then the tour with 3 buttons.
4. "menu" → interactive list appears.
5. "give ₦5,000 tithe" → checkout link → pay → receipt.
6. "how much giving this month?" → shows a populated total.
7. "add Sister Grace as an usher" → confirms added.
8. "switch to member" → confirmation; then "what needs my approval?" → refused (permission wall).
9. "back to pastor" → restored.

- [ ] **Step 5: Note for after the sales cycle**

To turn instant-demo off later: set `CHERTT_DEMO_MODE=off` in the Vercel project env and redeploy. Everything reverts to normal onboarding with no code change.

---

## Self-Review Notes

**Spec coverage:** flag → Task 1; session union + `demoRole` + migration → Task 2; `provisionDemoChurch` deterministic seed + idempotency → Task 3; `add_member`/`create_event` gaps → Task 4; capture→provision→tour intercept + demo-off regression → Task 5; full list menu + role switching + `demoRole` in ctx → Task 6; verification + reversibility note → Task 7. Deferred items (bulk generative, autonomy, reset wipe, gating every legacy report path) are intentionally untouched, matching the spec's Out of Scope.

**Placeholder scan:** none — every step carries complete code or an exact command. The one conditional ("if the pre-existing welcome test now asserts the demo path") names the exact fix (set `CHERTT_DEMO_MODE=off` in that test body).

**Type consistency:** `demoRole` is `string | undefined` end-to-end (session field ↔ `demo_role text` column ↔ `agentCtx` param ↔ cast to `Role`). `PhoneLink` shape used in Task 3's return and Task 5's mock matches `whatsapp-workspace.ts:8`. Tool names `add_member`/`create_event` (Task 4) are found by `.find` in their tests and auto-registered via the existing `AGENT_TOOLS` spreads. Button ids (`help_give`, `help_prayer`, `demo_menu`, `role:*`, `rpt:giving`, `rpt:overview`) are consistent between the tour/menu emitters and `handleButtonReply` routing. `InteractiveListRow` ({id,title,description?}) matches `whatsapp.ts:96`.
