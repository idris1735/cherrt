# Identity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the real identity foundation — creator role (no auto-pastor), IT/technical role, guest handling, automatic number-verification (L1), OTP + self-serve number migration — and remove demo mode entirely.

**Architecture:** Harden the existing person-centric spine (`people` / `phone_contacts` / `branch_memberships`). Change the founding role, add two roles, auto-verify inbound numbers, add an OTP module, and strip the demo surface so first contact is the real guest/creator onboarding.

**Tech Stack:** TypeScript, Next.js, Supabase (service-role), Vitest, Google Gemini. No new dependencies.

## Global Constraints

- No demo, no mocks in product behavior. Tests may stub outbound WhatsApp (`sendTextMessage`) as the suite already does.
- L1 (number-verified) is automatic: an active `phone_contacts` row with `verified_at` set. Set on first inbound.
- The founder of a church is `creator` (rank 6), **never** `senior_pastor`. Ministry titles are assigned later.
- `it_technical` (rank 2) can configure but **cannot read church data** — enforced via a `dataSensitive` tool flag.
- OTP: 6 digits, `sha256(code + OTP_PEPPER)`, 10-minute expiry, max 3 attempts, single active challenge per (phone, purpose).
- Migrations named `supabase/migrations/20260805_<name>.sql`; apply with `npx supabase db push`.

---

## Task 1: Roles — `creator`, `it_technical`, founder becomes creator

**Files:**
- Modify: `src/lib/services/identity/role-catalog.ts`
- Test: `src/lib/services/identity/role-catalog.test.ts`

**Interfaces:**
- Produces: `roleRank("creator") === 6`, `roleRank("it_technical") === 2`, `foundingAdminRole("church") === "creator"`. Consumed by Tasks 2, 8, 9.

- [ ] **Step 1: Update the failing tests**

In `src/lib/services/identity/role-catalog.test.ts`, change the founder assertion and add the new roles. Find:
```typescript
  it("seats a church founder as senior_pastor and others as owner", () => {
    expect(foundingAdminRole("church")).toBe("senior_pastor");
    expect(foundingAdminRole("toolkit")).toBe("owner");
  });
```
Replace with:
```typescript
  it("seats a church founder as creator (never a ministry title), others as owner", () => {
    expect(foundingAdminRole("church")).toBe("creator");
    expect(foundingAdminRole("toolkit")).toBe("owner");
  });

  it("ranks creator at the top and it_technical low", () => {
    expect(roleRank("creator")).toBe(6);
    expect(roleRank("it_technical")).toBe(2);
  });

  it("creator can assign any church role; it_technical can assign none", () => {
    expect(canAssignRole("creator", "pastor")).toBe(true);
    expect(canAssignRole("creator", "finance")).toBe(true);
    expect(canAssignRole("it_technical", "member")).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/services/identity/role-catalog.test.ts`
Expected: FAIL — `foundingAdminRole("church")` still returns `senior_pastor`; `creator`/`it_technical` rank 0.

- [ ] **Step 3: Implement**

In `src/lib/services/identity/role-catalog.ts`, add the two roles to `ROLE_RANK` (place `creator` with the rank-6 group, `it_technical` with rank 2):
```typescript
  secretary: 2,
  operations: 2,
  it_technical: 2,
  finance: 3,
```
and
```typescript
  owner: 6,
  senior_pastor: 6,
  creator: 6,
};
```
Change `foundingAdminRole`:
```typescript
export function foundingAdminRole(vertical: ModuleKey): string {
  return vertical === "church" ? "creator" : "owner";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/services/identity/role-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/identity/role-catalog.ts src/lib/services/identity/role-catalog.test.ts
git commit -m "feat: creator + it_technical roles; church founder is creator, not senior_pastor"
```

---

## Task 2: `it_technical` data-read denial

**Files:**
- Modify: `src/lib/services/agent/tools.ts` (add `dataSensitive` to `AgentTool`)
- Modify: `src/lib/services/agent/access.ts`
- Modify: `src/lib/services/agent/tools.ts` (tag sensitive READ_TOOLS)
- Test: `src/lib/services/agent/access.test.ts`

**Interfaces:**
- Consumes: `roleRank` (Task 1).
- Produces: `toolAccessError` denies any tool with `dataSensitive: true` for `ctx.role === "it_technical"`, regardless of rank.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/services/agent/access.test.ts`:
```typescript
  it("denies it_technical on data-sensitive tools but allows config tools", () => {
    const dataTool = { name: "list_members", description: "", parameters: { type: "object", properties: {} }, dataSensitive: true, minRank: 2, handler: async () => ({}) } as unknown as AgentTool;
    const configTool = { name: "set_church_personality", description: "", parameters: { type: "object", properties: {} }, handler: async () => ({}) } as unknown as AgentTool;
    const it: AgentContext = { workspaceId: "w", role: "it_technical" as Role };
    expect(toolAccessError(dataTool, it)).toMatch(/not view its data|configure/i);
    expect(toolAccessError(configTool, it)).toBeNull();
  });
```
Ensure the test file imports `AgentContext`, `AgentTool` from `@/lib/services/agent/tools` and `Role` from `@/lib/types` (add if missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/agent/access.test.ts`
Expected: FAIL — `dataSensitive` unknown; it_technical (rank 2) passes the `list_members` minRank 2 check.

- [ ] **Step 3: Add the `dataSensitive` flag to `AgentTool`**

In `src/lib/services/agent/tools.ts`, in the `AgentTool` type add:
```typescript
  // Reads or exposes church data (giving, members, prayer, PII). IT/technical
  // may configure the church but never read its data, so these are denied to it.
  dataSensitive?: boolean;
```

- [ ] **Step 4: Enforce in `toolAccessError`**

In `src/lib/services/agent/access.ts`, replace the function body so the data denial runs first:
```typescript
export function toolAccessError(tool: AgentTool, ctx: AgentContext): string | null {
  // IT/technical can configure but never read church data.
  if (ctx.role === "it_technical" && tool.dataSensitive) {
    return "Your role can configure the church's setup, but not view its data.";
  }
  if (tool.minRank === undefined) return null;
  if (roleRank(ctx.role) >= tool.minRank) return null;
  return "You don't have permission to do that here — please ask a church admin or the relevant leader.";
}
```

- [ ] **Step 5: Tag the sensitive READ tools**

In `src/lib/services/agent/tools.ts`, add `dataSensitive: true` to `get_giving_summary`, `get_pending_requests`, and `list_members` (each already has a `minRank`; add the flag alongside). Example for `list_members`:
```typescript
    minRank: 2, // roster is leadership-only
    dataSensitive: true,
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/services/agent/access.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/agent/tools.ts src/lib/services/agent/access.ts src/lib/services/agent/access.test.ts
git commit -m "feat: it_technical can configure but not read church data (dataSensitive gate)"
```

---

## Task 3: Allow `guest` membership status (schema)

**Files:**
- Create: `supabase/migrations/20260805_guest_membership_status.sql`

**Interfaces:**
- Produces: `branch_memberships.status` accepts `'guest'` (alongside `active`/`left`). Guest-membership *creation* is deferred to Phase 2; this only readies the schema.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260805_guest_membership_status.sql`:
```sql
-- Guest: connected to a church but not a full member (may do low-risk
-- self-service). Creation of guest memberships lands in a later slice; this
-- readies the schema so it isn't a blocker.
alter table public.branch_memberships
  drop constraint if exists branch_memberships_status_check;
alter table public.branch_memberships
  add constraint branch_memberships_status_check
  check (status in ('active', 'left', 'guest'));
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db push`
Expected: migration applies. Verify the constraint accepts guest:
```bash
psql "$DATABASE_URL" -c "insert into branch_memberships (person_id, workspace_id, role, status) values (gen_random_uuid(), gen_random_uuid(), 'member', 'guest') returning id;" 2>&1 | head
```
Expected: either a successful insert id, or a **foreign-key** error (person/workspace don't exist) — NOT a check-constraint error. (Roll back any test row.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260805_guest_membership_status.sql
git commit -m "feat: allow guest status on branch_memberships"
```

---

## Task 4: Remove demo mode

**Files:**
- Delete: `src/lib/services/demo/demo-mode.ts`, `src/lib/services/demo/provision-demo.ts`, `src/lib/services/demo/demo-mode.test.ts`, `src/lib/services/demo/provision-demo.test.ts`, `src/lib/services/whatsapp-session-demo.test.ts`
- Modify: `src/lib/services/whatsapp-processor.ts`, `src/lib/services/whatsapp-session.ts`
- Test: `src/lib/services/whatsapp-processor.test.ts`, `src/lib/services/whatsapp-session.test.ts`

**Interfaces:**
- Produces: an unlinked sender falls to the existing guest path (`runGuestAgent`); no `demo_*`/`role:`/`isDemo` code remains. `agentCtx(link, from, personId)` (no `demoRole` arg). `sendMainMenu(from)` (no `isDemo` arg).

- [ ] **Step 1: Delete the demo files**

```bash
git rm src/lib/services/demo/demo-mode.ts src/lib/services/demo/provision-demo.ts src/lib/services/demo/demo-mode.test.ts src/lib/services/demo/provision-demo.test.ts src/lib/services/whatsapp-session-demo.test.ts
```

- [ ] **Step 2: Strip demo from `whatsapp-session.ts`**

Remove the `isDemo` and `demoRole` fields from the `WhatsAppSession` type; remove the `demo-onboarding` arm of the `onboarding` union; remove `demo_role`/`is_demo` from the `DbRow` type, `toSession`, and `toDbRow`. (Leave the DB columns in place — harmless.)

- [ ] **Step 3: Strip demo from `whatsapp-processor.ts`**

Remove, in order:
- the imports `demoModeEnabled` and `provisionDemoChurch`;
- `handleDemoOnboarding`, `sendDemoTour`, `DEMO_ROLES`, `sendRoleMenu`, `handleRoleSwitch`;
- the demo-onboarding intercept block in `processWhatsAppMessage` (the `if (!link && demoModeEnabled() && …) { if (await handleDemoOnboarding(…)) return; }`);
- the `demo_menu`/`role:menu`/`role:`/`demo_event` handling in `handleButtonReply` — **keep** `main_menu` → `sendMainMenu(from)`;
- the demo text-shortcut block (the `MENU_RE`/role-switch block guarded by `demoModeEnabled() && session.isDemo`) — **keep** the `MENU_RE` → `sendMainMenu(from)` line for linked users, drop the role-switch lines;
- change `sendMainMenu(from: string, isDemo: boolean)` → `sendMainMenu(from: string)` and drop the `if (isDemo) rows.push({ id: "role:menu", … })` line and its `demo_menu` button in the tour/welcome (replace `demo_menu` button id with `main_menu`);
- change `agentCtx(link, from, personId?, demoRole?)` → `agentCtx(link, from, personId?)` and remove the `demoRole ?? ` from the role line; update all four call sites to drop the `session.demoRole` argument.

- [ ] **Step 4: Update the tests**

In `src/lib/services/whatsapp-processor.test.ts`: delete the `describe`/`it` blocks that reference `CHERTT_DEMO_MODE`, `demo menu`, `role switch`, `Try another role`, `provisionDemoChurch`, `isDemo` (the Instant-Demo tests). Remove the `beforeEach` line `process.env.CHERTT_DEMO_MODE = "off";`. Keep the guest-welcome and agent tests. In `src/lib/services/whatsapp-session.test.ts`, remove any assertion referencing `demoRole`/`isDemo` if present.

- [ ] **Step 5: Run the suite + typecheck**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts src/lib/services/whatsapp-session.test.ts`
Then: `npx tsc --noEmit`
Expected: PASS, no type errors (fix any leftover references the compiler flags).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove demo mode (instant provisioning, role-switching, demo gating)"
```

---

## Task 5: Auto-verify inbound number (L1) — `ensureVerifiedPerson`

**Files:**
- Modify: `src/lib/services/identity/provisioning.ts`
- Modify: `src/lib/services/whatsapp-processor.ts` (call it on inbound)
- Test: `src/lib/services/identity/provisioning.test.ts` (create if absent)

**Interfaces:**
- Produces: `export async function ensureVerifiedPerson(phoneRaw: string): Promise<string | null>` — returns the `person_id` for the phone, creating a `people` row + active `phone_contacts` row with `verified_at = now()` when absent, and setting `verified_at` if an active contact exists without it. Returns `null` if storage is unavailable.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/identity/provisioning.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { contact: null as any, inserts: [] as any[], updates: [] as any[] } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: store.contact }) }), maybeSingle: () => Promise.resolve({ data: store.contact }) }) }),
      insert: (row: any) => { store.inserts.push({ table, row }); return { select: () => ({ single: () => Promise.resolve({ data: { id: "new-person" }, error: null }) }) }; },
      update: (row: any) => ({ eq: () => ({ eq: () => { store.updates.push({ table, row }); return Promise.resolve({ error: null }); } }) }),
    }),
  }),
}));

import { ensureVerifiedPerson } from "@/lib/services/identity/provisioning";

beforeEach(() => { store.contact = null; store.inserts.length = 0; store.updates.length = 0; });

describe("ensureVerifiedPerson", () => {
  it("creates a person + verified active contact for an unknown number", async () => {
    const id = await ensureVerifiedPerson("2348012345678");
    expect(id).toBe("new-person");
    expect(store.inserts.map((i) => i.table)).toEqual(["people", "phone_contacts"]);
    expect(store.inserts[1].row).toMatchObject({ phone_number: "2348012345678", person_id: "new-person", status: "active" });
    expect(store.inserts[1].row.verified_at).toBeTruthy();
  });

  it("returns the existing person and sets verified_at when missing", async () => {
    store.contact = { person_id: "p1", verified_at: null };
    const id = await ensureVerifiedPerson("2348012345678");
    expect(id).toBe("p1");
    expect(store.inserts).toHaveLength(0);
    expect(store.updates.length).toBe(1); // verified_at backfilled
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/identity/provisioning.test.ts`
Expected: FAIL — `ensureVerifiedPerson` not exported.

- [ ] **Step 3: Implement**

In `src/lib/services/identity/provisioning.ts` (reuse the existing phone-normalizing + `getSupabaseServerClient` pattern already in the file), add:
```typescript
// Every inbound WhatsApp number is a known, number-verified (L1) person: the
// inbound message itself proves control of the number. Creates the person +
// active verified contact when absent; backfills verified_at otherwise.
export async function ensureVerifiedPerson(phoneRaw: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const phone = normalizePhone(phoneRaw); // existing helper in this file
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from("phone_contacts")
    .select("person_id, verified_at")
    .eq("phone_number", phone)
    .eq("status", "active")
    .maybeSingle();

  if (existing?.person_id) {
    if (!existing.verified_at) {
      await db.from("phone_contacts").update({ verified_at: now }).eq("phone_number", phone).eq("status", "active");
    }
    return existing.person_id as string;
  }

  const { data: person, error } = await db.from("people").insert({ full_name: "" }).select("id").single();
  if (error || !person) return null;
  await db.from("phone_contacts").insert({ phone_number: phone, person_id: person.id, status: "active", verified_at: now });
  return person.id as string;
}
```
(If the file has no `normalizePhone`, use the same normalization the file already applies in `migratePersonPhone`.)

- [ ] **Step 4: Wire into inbound**

In `src/lib/services/whatsapp-processor.ts`, import `ensureVerifiedPerson`, and call it right after the message is claimed and before link resolution, so every sender is a known L1 person:
```typescript
  await ensureVerifiedPerson(from).catch(() => null);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/lib/services/identity/provisioning.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/identity/provisioning.ts src/lib/services/identity/provisioning.test.ts src/lib/services/whatsapp-processor.ts
git commit -m "feat: every inbound number becomes a known, number-verified (L1) person"
```

---

## Task 6: Verification level helper

**Files:**
- Create: `src/lib/services/identity/verification.ts`
- Test: `src/lib/services/identity/verification.test.ts`

**Interfaces:**
- Produces: `export async function verificationLevel(personId: string): Promise<0 | 1 | 2>` — `1` when the person has an active `phone_contacts` row with `verified_at` set; `2` reserved for Mono (always returns ≤1 in this slice); `0` otherwise.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/identity/verification.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { row: null as any } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ not: () => ({ maybeSingle: () => Promise.resolve({ data: store.row }) }) }) }) }) }),
  }),
}));

import { verificationLevel } from "@/lib/services/identity/verification";

beforeEach(() => { store.row = null; });

describe("verificationLevel", () => {
  it("is 1 for a person with an active verified contact", async () => {
    store.row = { id: "c1" };
    expect(await verificationLevel("p1")).toBe(1);
  });
  it("is 0 with no verified contact", async () => {
    store.row = null;
    expect(await verificationLevel("p1")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/identity/verification.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/identity/verification.ts`:
```typescript
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

// L0 unknown · L1 number-verified (active contact with verified_at) · L2
// identity-verified (Mono NIN — a later slice; never returned here yet).
export async function verificationLevel(personId: string): Promise<0 | 1 | 2> {
  const db = getSupabaseServerClient();
  if (!db) return 0;
  const { data } = await db
    .from("phone_contacts")
    .select("id")
    .eq("person_id", personId)
    .eq("status", "active")
    .not("verified_at", "is", null)
    .maybeSingle();
  return data ? 1 : 0;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/services/identity/verification.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/identity/verification.ts src/lib/services/identity/verification.test.ts
git commit -m "feat: verificationLevel helper (L1 from a verified active contact)"
```

---

## Task 7: OTP module + table

**Files:**
- Create: `supabase/migrations/20260805_otp_challenges.sql`
- Create: `src/lib/services/identity/otp.ts`
- Test: `src/lib/services/identity/otp.test.ts`

**Interfaces:**
- Consumes: `sendTextMessage` from `@/lib/services/whatsapp`.
- Produces: `sendOtp(phone: string, purpose: "migrate" | "step_up"): Promise<boolean>` and `verifyOtp(phone: string, purpose: "migrate" | "step_up", code: string): Promise<{ ok: boolean; reason?: "expired" | "wrong" | "too_many" | "none" }>`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260805_otp_challenges.sql`:
```sql
create table if not exists public.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  purpose text not null check (purpose in ('migrate', 'step_up')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists otp_challenges_phone_purpose_idx on public.otp_challenges (phone_number, purpose);
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/services/identity/otp.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { rows: [] as any[] } }));
vi.mock("@/lib/services/whatsapp", () => ({ sendTextMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: (row: any) => { store.rows.push({ ...row }); return Promise.resolve({ error: null }); },
      select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: store.rows.filter((r) => !r.consumed_at).slice(-1)[0] ?? null }) }) }) }) }) }) }),
      update: (row: any) => ({ eq: () => { Object.assign(store.rows.slice(-1)[0] ?? {}, row); return Promise.resolve({ error: null }); } }),
    }),
  }),
}));

import { sendOtp, verifyOtp } from "@/lib/services/identity/otp";
import { sendTextMessage } from "@/lib/services/whatsapp";

beforeEach(() => { store.rows.length = 0; });
afterEach(() => { vi.clearAllMocks(); });

describe("otp", () => {
  it("sends a 6-digit code over WhatsApp and verifies it once", async () => {
    const ok = await sendOtp("234800", "migrate");
    expect(ok).toBe(true);
    const body = (sendTextMessage as any).mock.calls[0][1] as string;
    const code = body.match(/\b(\d{6})\b/)![1];
    expect(await verifyOtp("234800", "migrate", code)).toMatchObject({ ok: true });
  });

  it("rejects the wrong code", async () => {
    await sendOtp("234800", "migrate");
    expect(await verifyOtp("234800", "migrate", "000000")).toMatchObject({ ok: false, reason: "wrong" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/services/identity/otp.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

Create `src/lib/services/identity/otp.ts`:
```typescript
import { createHash, randomInt } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { sendTextMessage } from "@/lib/services/whatsapp";

type Purpose = "migrate" | "step_up";
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function hash(code: string): string {
  return createHash("sha256").update(code + (process.env.OTP_PEPPER ?? "chertt-otp")).digest("hex");
}

export async function sendOtp(phone: string, purpose: Purpose): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // One active challenge per (phone, purpose): clear old ones first.
  await db.from("otp_challenges").delete().eq("phone_number", phone).eq("purpose", purpose);
  const { error } = await db.from("otp_challenges").insert({
    phone_number: phone, purpose, code_hash: hash(code), expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  });
  if (error) return false;
  try {
    await sendTextMessage(phone, `Your Chertt code is *${code}*. It expires in 10 minutes. Never share it.`);
  } catch { /* code is stored; a resend can retry */ }
  return true;
}

export async function verifyOtp(phone: string, purpose: Purpose, code: string): Promise<{ ok: boolean; reason?: "expired" | "wrong" | "too_many" | "none" }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false, reason: "none" };
  const { data } = await db
    .from("otp_challenges")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("phone_number", phone)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; code_hash: string; expires_at: string; attempts: number } | null;
  if (!row) return { ok: false, reason: "none" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (hash(code) !== row.code_hash) {
    await db.from("otp_challenges").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { ok: false, reason: "wrong" };
  }
  await db.from("otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}
```

- [ ] **Step 5: Apply migration, run tests, typecheck**

Run: `npx supabase db push`
Run: `npx vitest run src/lib/services/identity/otp.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260805_otp_challenges.sql src/lib/services/identity/otp.ts src/lib/services/identity/otp.test.ts
git commit -m "feat: OTP module over WhatsApp (send/verify, hashed, expiring, attempt-capped)"
```

---

## Task 8: Self-serve number migration via OTP

**Files:**
- Modify: `src/lib/services/agent/migration-tools.ts`
- Test: `src/lib/services/agent/migration-tools.test.ts`

**Interfaces:**
- Consumes: `sendOtp`, `verifyOtp` (Task 7); `migratePersonPhone` (existing).
- Produces: two guest tools — `start_number_migration` (verifies the OLD number via OTP, sends a code there) and `confirm_number_migration` (checks the code, then calls `migratePersonPhone`). The existing admin-approval tools stay as the fallback when the old number is unreachable.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/services/agent/migration-tools.test.ts` (mock `@/lib/services/identity/otp` and `@/lib/services/identity/provisioning`):
```typescript
vi.mock("@/lib/services/identity/otp", () => ({ sendOtp: vi.fn().mockResolvedValue(true), verifyOtp: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/services/identity/provisioning", () => ({ migratePersonPhone: vi.fn().mockResolvedValue(true), resolvePersonIdByPhone: vi.fn().mockResolvedValue("p1") }));

// ...
it("start_number_migration sends an OTP to the old number", async () => {
  const tool = GUEST_MIGRATION_TOOLS.find((t) => t.name === "start_number_migration")!;
  const out = await tool.handler({ oldPhone: "234800old" }, { workspaceId: "", role: "member", phone: "234800new" }) as { ok?: boolean };
  const { sendOtp } = await import("@/lib/services/identity/otp");
  expect(sendOtp).toHaveBeenCalledWith("234800old", "migrate");
  expect(out.ok).toBe(true);
});

it("confirm_number_migration verifies then migrates", async () => {
  const tool = GUEST_MIGRATION_TOOLS.find((t) => t.name === "confirm_number_migration")!;
  const out = await tool.handler({ oldPhone: "234800old", code: "123456" }, { workspaceId: "", role: "member", phone: "234800new" }) as { ok?: boolean };
  const { migratePersonPhone } = await import("@/lib/services/identity/provisioning");
  expect(migratePersonPhone).toHaveBeenCalled();
  expect(out.ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/agent/migration-tools.test.ts`
Expected: FAIL — tools not defined.

- [ ] **Step 3: Add a `resolvePersonIdByPhone` helper**

In `src/lib/services/identity/provisioning.ts` add (used to find the person behind the OLD number):
```typescript
export async function resolvePersonIdByPhone(phoneRaw: string): Promise<string | null> {
  const db = getSupabaseServerClient();
  if (!db) return null;
  const { data } = await db.from("phone_contacts").select("person_id").eq("phone_number", normalizePhone(phoneRaw)).eq("status", "active").maybeSingle();
  return (data?.person_id as string) ?? null;
}
```

- [ ] **Step 4: Implement the two tools**

In `src/lib/services/agent/migration-tools.ts`, import the helpers and add to `GUEST_MIGRATION_TOOLS`:
```typescript
  {
    name: "start_number_migration",
    description: "Begin moving a member's history to the number they're messaging from. Use when someone says they changed their phone number and still have the OLD number. Sends a code to the old number.",
    parameters: { type: "object", properties: { oldPhone: { type: "string", description: "Their previous WhatsApp number" } }, required: ["oldPhone"] },
    mutates: true,
    handler: async (args, ctx) => {
      const oldPhone = String(args.oldPhone ?? "").trim();
      if (!oldPhone) return { error: "What was your old number?" };
      const personId = await resolvePersonIdByPhone(oldPhone);
      if (!personId) return { error: "I couldn't find that old number on record — a church admin can help you reconnect." };
      const sent = await sendOtp(oldPhone, "migrate");
      if (!sent) return { error: "Couldn't send the code just now — please try again." };
      return { ok: true, message: "I've sent a 6-digit code to your OLD number. Reply with it here to finish moving your account." };
    },
  },
  {
    name: "confirm_number_migration",
    description: "Finish a number migration by confirming the code sent to the old number.",
    parameters: { type: "object", properties: { oldPhone: { type: "string" }, code: { type: "string", description: "The 6-digit code from the old number" } }, required: ["oldPhone", "code"] },
    mutates: true,
    handler: async (args, ctx) => {
      const oldPhone = String(args.oldPhone ?? "").trim();
      const code = String(args.code ?? "").trim();
      const newPhone = ctx.phone ?? "";
      if (!oldPhone || !code || !newPhone) return { error: "Need your old number and the code." };
      const check = await verifyOtp(oldPhone, "migrate", code);
      if (!check.ok) return { error: check.reason === "expired" ? "That code has expired — say you changed your number to start again." : "That code isn't right. Try again." };
      const personId = await resolvePersonIdByPhone(oldPhone);
      if (!personId) return { error: "Couldn't find that old number anymore." };
      const ok = await migratePersonPhone(personId, newPhone);
      if (!ok) return { error: "This new number is already linked to someone else — a church admin can help." };
      return { ok: true, message: "✅ Done — your history now lives on this number. Welcome back." };
    },
  },
```
Add the imports at the top:
```typescript
import { sendOtp, verifyOtp } from "@/lib/services/identity/otp";
import { migratePersonPhone, resolvePersonIdByPhone } from "@/lib/services/identity/provisioning";
```
(Remove the now-duplicate `migratePersonPhone` import if it already exists.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/lib/services/agent/migration-tools.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/agent/migration-tools.ts src/lib/services/agent/migration-tools.test.ts src/lib/services/identity/provisioning.ts
git commit -m "feat: self-serve number migration via OTP to the old number (admin approval stays as fallback)"
```

---

## Task 9: Creator recognized as admin/approver + end-to-end check

**Files:**
- Modify: `src/lib/services/whatsapp-workspace.ts:751`, `:858`
- Test: full suite + typecheck

**Interfaces:**
- Consumes: `foundingAdminRole` → `creator` (Task 1).
- Produces: the founder (`creator`) is recognized wherever the code looks for the church's top authority (approver lookup, admin lookup).

- [ ] **Step 1: Include `creator` in the authority queries**

In `src/lib/services/whatsapp-workspace.ts`, the approver query around line 751:
```typescript
    .in("role", [leadRole, "owner", "senior_pastor", "creator"])
```
and the admin query around line 858:
```typescript
    .in("user_role", ["owner", "senior_pastor", "admin", "pastor", "creator"])
```

- [ ] **Step 2: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors. Fix any remaining references to deleted demo symbols the compiler flags.

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/whatsapp-workspace.ts
git commit -m "feat: recognize creator as church admin/approver end-to-end"
```

---

## Self-Review Notes

**Spec coverage:** roles (creator/it_technical) → Task 1; it_technical data-deny → Task 2; guest status → Task 3; demo removal → Task 4; L1 auto on inbound → Task 5; verification level → Task 6; OTP → Task 7; self-serve migration → Task 8; creator recognized as authority → Task 9. Non-goals (Mono KYC/L2, dashboard, own-number routing, payments) are untouched, matching the spec.

**Placeholder scan:** none — every code step carries real code; deletion steps (Task 4) enumerate exact symbols. The one `psql` verify in Task 3 accepts either an id or a foreign-key error (explicitly not a check error).

**Type consistency:** `ensureVerifiedPerson`/`resolvePersonIdByPhone`/`verificationLevel` signatures match across Tasks 5/6/8. `sendOtp`/`verifyOtp` purpose union (`"migrate" | "step_up"`) is identical in Tasks 7 and 8. `dataSensitive` (Task 2) is set on tools tagged in the same task. `sendMainMenu(from)` and `agentCtx(link, from, personId?)` (Task 4) are used with those exact arities in Task 9's end-to-end pass.
