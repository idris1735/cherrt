# Web-KYC Wiring + Tiered Access — Implementation Plan (Slice 2, Plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the KYC flow end-to-end — the WhatsApp "set up my church" trigger issues a KYC token and texts the `/onboard/[token]` link (replacing the old in-chat pending-org signup); web approval seeds the applicant's post-approval setup so they continue configuring in WhatsApp; and sensitive actions (money, adding members) are blocked until the church is approved.

**Architecture:** `startSignupFlow` stops collecting church details in chat and instead calls `startApplication` (Plan 1) → sends the secure onboard URL. `approveKycApplication` (Plan 3) additionally calls `startSetupFlow` so the newly-approved creator's next WhatsApp message resumes the existing post-approval setup (giving categories → ministries → branches). A small `churchApproved(workspaceId)` guard (org status) gates `record_giving` and `add_member`.

**Tech Stack:** TypeScript, Next.js 16, Supabase (service-role), Vitest.

## Global Constraints

- Onboard link base: `process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app"` + `/onboard/{token}` (matches the existing `APP_URL` convention in whatsapp-processor).
- The old in-chat `new-church-signup` collection is retired for NEW signups (trigger no longer sets that session); `advanceSignupFlow` stays in place so any in-flight old sessions still resolve (backward compatible).
- Tiered access is defense-in-depth: a real workspace only exists after approval, so `churchApproved` returns `true` for any org that is `active` (and `true` when no org row exists, to never break legacy/demo workspaces). It blocks only when an org is explicitly non-active.
- Approve/notify remain best-effort + idempotent (Plan 3 behavior unchanged).

---

## Task 1: "Set up my church" issues a KYC link (replaces in-chat signup)

**Files:**
- Modify: `src/lib/services/onboarding-flow.ts` (`startSignupFlow`)
- Test: `src/lib/services/onboarding-flow.test.ts` (add a case; create the file if it doesn't exist)

**Interfaces:**
- Consumes: `startApplication(phone)` (kyc/applications) → `{ token } | null`.
- Produces: `startSignupFlow(phoneNumber): Promise<string>` now returns a message containing `${APP_URL}/onboard/${token}` and does NOT set an onboarding session.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/services/onboarding-flow.test.ts` (create with this content if absent):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { startAppMock, updateSessionMock } = vi.hoisted(() => ({
  startAppMock: vi.fn(),
  updateSessionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/kyc/applications", () => ({ startApplication: startAppMock }));
vi.mock("@/lib/services/whatsapp-session", () => ({ updateSession: updateSessionMock }));
// Keep the heavy workspace/template deps quiet — this test only exercises startSignupFlow.
vi.mock("@/lib/services/whatsapp-workspace", () => ({
  createPendingOrganization: vi.fn(), platformAdminPhones: () => [], createBranch: vi.fn(),
  saveGivingCategories: vi.fn(), saveMinistryUnits: vi.fn(), codeFromWorkspaceId: () => "CODE",
}));
vi.mock("@/lib/services/whatsapp-templates", () => ({ sendNewSignupAlertTemplate: vi.fn() }));

import { startSignupFlow } from "@/lib/services/onboarding-flow";

beforeEach(() => { vi.clearAllMocks(); process.env.NEXT_PUBLIC_APP_URL = "https://chertt.test"; });

describe("startSignupFlow (web KYC)", () => {
  it("issues a KYC token and returns the onboard link", async () => {
    startAppMock.mockResolvedValue({ token: "tok123" });
    const reply = await startSignupFlow("2348001112222");
    expect(startAppMock).toHaveBeenCalledWith("2348001112222");
    expect(reply).toContain("https://chertt.test/onboard/tok123");
    // No in-chat signup session is created anymore.
    expect(updateSessionMock).not.toHaveBeenCalledWith("2348001112222", expect.objectContaining({ onboarding: expect.objectContaining({ flow: "new-church-signup" }) }));
  });
  it("degrades gracefully if a token can't be created", async () => {
    startAppMock.mockResolvedValue(null);
    const reply = await startSignupFlow("2348001112222");
    expect(reply).toMatch(/try again/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/onboarding-flow.test.ts`
Expected: FAIL — `startSignupFlow` still starts the in-chat flow / no link.

- [ ] **Step 3: Implement**

In `src/lib/services/onboarding-flow.ts`, add the import near the top:
```typescript
import { startApplication } from "@/lib/services/kyc/applications";
```
Replace the whole `startSignupFlow` function with:
```typescript
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app";

// A church now onboards on a secure web page with real KYC — not by typing
// details into chat. We mint a single-use application token and send the link;
// the web form + platform review (see kyc/*) take it from there.
export async function startSignupFlow(phoneNumber: string): Promise<string> {
  const app = await startApplication(phoneNumber);
  if (!app) {
    return "Something went wrong starting your church setup — please try again in a moment.";
  }
  return [
    "Setting up a church on Chertt takes a quick, secure verification (Nigerian law — we confirm your CAC registration and your ID).",
    "",
    "Open this private link to continue — it's just for you:",
    `${APP_URL()}/onboard/${app.token}`,
    "",
    "Once you submit, our team reviews it and I'll message you here the moment you're approved.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/onboarding-flow.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/onboarding-flow.ts src/lib/services/onboarding-flow.test.ts
git commit -m "feat: 'set up my church' issues a KYC onboard link (retires in-chat signup)"
```

---

## Task 2: Approval resumes post-approval setup in WhatsApp

**Files:**
- Modify: `src/lib/services/kyc/review.ts` (`approveKycApplication`)
- Test: `src/lib/services/kyc/review.test.ts` (extend)

**Interfaces:**
- Consumes: `startSetupFlow(phone, organizationId, workspaceId)` (onboarding-flow) — seeds the `post-approval-setup` session.
- Produces: no signature change; `approveKycApplication` now also seeds the setup session (best-effort).

- [ ] **Step 1: Extend the test**

In `src/lib/services/kyc/review.test.ts`, add to the hoisted mocks and a new assertion:
```typescript
// add to the vi.hoisted(...) object:
//   startSetupMock: vi.fn().mockResolvedValue("setup prompt"),
// add mock:
vi.mock("@/lib/services/onboarding-flow", () => ({ startSetupFlow: startSetupMock }));
```
Add inside `describe("approveKycApplication")`:
```typescript
it("seeds the post-approval setup for the applicant", async () => {
  await approveKycApplication("k1", "ops@chertt.com");
  expect(startSetupMock).toHaveBeenCalledWith("234800", "org1", "ws1");
});
```
(Update the `vi.hoisted` destructuring to include `startSetupMock`, and `beforeEach`'s `clearAllMocks` already covers it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/review.test.ts`
Expected: FAIL — `startSetupFlow` not called.

- [ ] **Step 3: Implement**

In `src/lib/services/kyc/review.ts`, add the import:
```typescript
import { startSetupFlow } from "@/lib/services/onboarding-flow";
```
In `approveKycApplication`, immediately after the `kyc_applications` update to `approved` and before the notify, add:
```typescript
  // Resume onboarding in WhatsApp: seed the post-approval setup so the creator's
  // next message continues configuring giving categories, ministries, branches.
  try { if (org?.id) await startSetupFlow(app.applicant_phone, org.id, ws.id); } catch { /* best-effort */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/review.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/kyc/review.ts src/lib/services/kyc/review.test.ts
git commit -m "feat: KYC approval resumes post-approval setup in WhatsApp"
```

---

## Task 3: Tiered access — block money/members until approved

**Files:**
- Create: `src/lib/services/kyc/tiered-access.ts`
- Modify: `src/lib/services/agent/church-tools.ts` (`record_giving`, `add_member` handlers)
- Test: `src/lib/services/kyc/tiered-access.test.ts`

**Interfaces:**
- Produces: `churchApproved(workspaceId: string): Promise<boolean>` — `true` if the workspace's org is `active` OR has no org row (legacy/demo); `false` only when an org exists and isn't `active`.
- Consumed by the two sensitive handlers.

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/kyc/tiered-access.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: { workspace: null as any, org: null as any } }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: table === "workspaces" ? store.workspace : store.org }) }) }),
    }),
  }),
}));

import { churchApproved } from "@/lib/services/kyc/tiered-access";

beforeEach(() => { store.workspace = { organization_id: "org1" }; store.org = { status: "active" }; });

describe("churchApproved", () => {
  it("true when the org is active", async () => {
    expect(await churchApproved("ws1")).toBe(true);
  });
  it("false when the org exists but isn't active", async () => {
    store.org = { status: "pending_approval" };
    expect(await churchApproved("ws1")).toBe(false);
  });
  it("true when the workspace has no org (legacy/demo)", async () => {
    store.workspace = { organization_id: null };
    expect(await churchApproved("ws1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/kyc/tiered-access.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/lib/services/kyc/tiered-access.ts`:
```typescript
import { getSupabaseServerClient } from "@/lib/services/supabase-server";

// Defense-in-depth: a workspace normally only exists after KYC approval, but
// this guard makes "unverified churches can do nothing sensitive" explicit.
// Approved = the workspace's organization is 'active'. No org row (legacy/demo)
// counts as approved so existing workspaces are never broken.
export async function churchApproved(workspaceId: string): Promise<boolean> {
  const db = getSupabaseServerClient();
  if (!db) return true; // fail open — storage issues shouldn't block existing churches
  const { data: ws } = await db.from("workspaces").select("organization_id").eq("id", workspaceId).maybeSingle();
  const orgId = (ws as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return true;
  const { data: org } = await db.from("organizations").select("status").eq("id", orgId).maybeSingle();
  const status = (org as { status: string } | null)?.status;
  if (!status) return true;
  return status === "active";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/kyc/tiered-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate the sensitive handlers**

In `src/lib/services/agent/church-tools.ts`, add the import near the top:
```typescript
import { churchApproved } from "@/lib/services/kyc/tiered-access";
```
At the very top of the `record_giving` handler body (before the amount check):
```typescript
      if (!(await churchApproved(ctx.workspaceId))) return { error: "Your church is still being verified — you'll be able to record giving once it's approved." };
```
At the very top of the `add_member` handler body (before the name check):
```typescript
      if (!(await churchApproved(ctx.workspaceId))) return { error: "Your church is still being verified — you'll be able to add members once it's approved." };
```

- [ ] **Step 6: Verify the gate with a focused test**

Add to `src/lib/services/kyc/tiered-access.test.ts` (append; mock churchApproved's dependency to return not-approved and drive one handler):
```typescript
import { describe as d2, it as i2, expect as e2, vi as v2, beforeEach as b2 } from "vitest";

v2.mock("@/lib/services/agent/tools", async (orig) => ({ ...(await orig<any>()) }));
// Drive record_giving with a non-approved church by mocking churchApproved.
v2.mock("@/lib/services/kyc/tiered-access", async (orig) => {
  const actual = await orig<typeof import("@/lib/services/kyc/tiered-access")>();
  return { ...actual, churchApproved: v2.fn().mockResolvedValue(false) };
});

d2("sensitive tools are gated when unapproved", () => {
  b2(() => v2.resetModules());
  i2("record_giving refuses when the church isn't approved", async () => {
    const { CHURCH_TOOLS } = await import("@/lib/services/agent/church-tools");
    const tool = CHURCH_TOOLS.find((t: any) => t.name === "record_giving");
    const res = await tool.handler({ amount: 5000 }, { workspaceId: "ws1", role: "creator", userName: "x", phone: "1", personId: null });
    e2(res.error).toMatch(/being verified/i);
  });
});
```
NOTE: confirm the export name of the tool array in `church-tools.ts` (e.g. `CHURCH_TOOLS`) and use it; if the array isn't exported, export it. Adjust the import accordingly.

- [ ] **Step 7: Run tests + full suite + typecheck**

Run: `npx vitest run src/lib/services/kyc/tiered-access.test.ts`
Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/services/kyc/tiered-access.ts src/lib/services/kyc/tiered-access.test.ts src/lib/services/agent/church-tools.ts
git commit -m "feat: tiered access — block giving/add-member until the church is approved"
```

---

## Self-Review Notes

**Spec coverage (Slice 2 completion):** rewire "set up my church" → web KYC link → Task 1; approval starts post-approval setup → Task 2; tiered access (money/members blocked until approved) → Task 3. Broadcast is listed in the spec but no broadcast agent tool exists yet (the WhatsApp broadcast template is unactivated), so there is no entry point to gate — noted, not skipped. With this plan the whole KYC slice is connected end-to-end: WhatsApp trigger → web form (Plan 2) → engine checks (Plan 1) → review dashboard (Plan 3) → approval → back into WhatsApp.

**Placeholder scan:** none — every step has real code. Step 6 carries a NOTE to confirm the tool-array export name before importing it; the surrounding code and assertions are concrete.

**Type consistency:** `startApplication` returns `{ token } | null` and is consumed as such (Task 1). `startSetupFlow(phone, organizationId, workspaceId)` matches its definition in onboarding-flow.ts (Task 2). `churchApproved(workspaceId): Promise<boolean>` is used identically in both gated handlers (Task 3). The gated handlers already receive `ctx.workspaceId` (AgentContext), which both use elsewhere.
