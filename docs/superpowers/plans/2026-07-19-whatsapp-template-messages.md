# WhatsApp Message-Template Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three business-initiated `sendTextMessage` calls that fall outside WhatsApp's 24-hour session window (new-signup alert to platform admins, org-approved and org-rejected messages to requesters) with calls to pre-approved Meta message templates.

**Architecture:** One generic `sendTemplateMessage` primitive added to `whatsapp.ts` (mirrors the existing `sendTextMessage`/`sendInteractiveButtons` shape, posts a `type: "template"` payload via the existing `postToGraph` helper). A new `whatsapp-templates.ts` module wraps it with three typed, named functions — one per message — so call sites never hand-assemble a positional parameter array. Three call sites swap their `sendTextMessage` call for the matching wrapper; the REJECT handler additionally gains an optional trailing "reason" argument.

**Tech Stack:** TypeScript, Next.js, vitest, WhatsApp Cloud API (Graph API v19.0, via existing `postToGraph` in `src/lib/services/whatsapp.ts`).

## Global Constraints

- Template category: **UTILITY** for all three templates (per spec — transactional, not promotional).
- Template language: **English** (`en`), matching `LANGUAGE_CODE` constant.
- Template names default to `chertt_new_signup_alert`, `chertt_org_approved`, `chertt_org_rejected`, each overridable via env vars `WHATSAPP_TEMPLATE_NEW_SIGNUP`, `WHATSAPP_TEMPLATE_ORG_APPROVED`, `WHATSAPP_TEMPLATE_ORG_REJECTED` respectively.
- Failure handling: log via `console.error` and continue — no retry queue, matches the existing pattern already in the APPROVE handler.
- No changes to any send path other than these three (spec: "Explicitly out of scope").

---

### Task 1: `sendTemplateMessage` primitive in `whatsapp.ts`

**Files:**
- Modify: `src/lib/services/whatsapp.ts`

**Interfaces:**
- Consumes: existing `postToGraph(payload: unknown): Promise<void>` (already defined in this file, `whatsapp.ts:20-30`).
- Produces: `sendTemplateMessage(to: string, templateName: string, languageCode: string, params: string[]): Promise<void>`, exported for use by `whatsapp-templates.ts` in Task 2.

There is no dedicated `whatsapp.test.ts` in this codebase today — `sendTextMessage`/`sendInteractiveButtons`/`sendInteractiveList` all call `fetch` directly through `postToGraph` and are not unit-tested in isolation (they're exercised indirectly through `whatsapp-processor.test.ts`, which mocks the whole module). This task follows that existing convention: no new test file for the primitive itself. Task 2's test covers the wrapper layer by mocking this function.

- [ ] **Step 1: Add `sendTemplateMessage` to `whatsapp.ts`**

Add this function immediately after `sendTextMessage` (after line 39, before the `InteractiveButton` type on line 41):

```typescript
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  params: string[],
): Promise<void> {
  await postToGraph({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: params.length
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
        : [],
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/whatsapp.ts
git commit -m "feat: add sendTemplateMessage primitive for business-initiated WhatsApp sends"
```

---

### Task 2: `whatsapp-templates.ts` wrapper module

**Files:**
- Create: `src/lib/services/whatsapp-templates.ts`
- Test: `src/lib/services/whatsapp-templates.test.ts`

**Interfaces:**
- Consumes: `sendTemplateMessage` from Task 1 (`src/lib/services/whatsapp.ts`), signature `(to: string, templateName: string, languageCode: string, params: string[]) => Promise<void>`.
- Produces:
  - `sendNewSignupAlertTemplate(to: string, fields: { churchName: string; adminName: string; adminPhone: string; city: string; size: string; code: string }): Promise<void>`
  - `sendOrgApprovedTemplate(to: string, adminName: string, workspaceName: string): Promise<void>`
  - `sendOrgRejectedTemplate(to: string, churchName: string, reason: string): Promise<void>`

  These three are consumed by Task 3 (`onboarding-flow.ts`) and Task 4/5 (`whatsapp-processor.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/whatsapp-templates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/whatsapp", () => ({
  sendTemplateMessage: vi.fn().mockResolvedValue(undefined),
}));

import { sendTemplateMessage } from "@/lib/services/whatsapp";
import {
  sendNewSignupAlertTemplate,
  sendOrgApprovedTemplate,
  sendOrgRejectedTemplate,
} from "@/lib/services/whatsapp-templates";

const mockSend = sendTemplateMessage as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_TEMPLATE_NEW_SIGNUP;
  delete process.env.WHATSAPP_TEMPLATE_ORG_APPROVED;
  delete process.env.WHATSAPP_TEMPLATE_ORG_REJECTED;
});

describe("sendNewSignupAlertTemplate", () => {
  it("sends the new-signup template with params in order", async () => {
    await sendNewSignupAlertTemplate("2348011111111", {
      churchName: "Grace Chapel",
      adminName: "Ruth Adeyemi",
      adminPhone: "2348022222222",
      city: "Lagos",
      size: "300",
      code: "ab12cd34",
    });

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_new_signup_alert",
      "en",
      ["Grace Chapel", "Ruth Adeyemi", "2348022222222", "Lagos", "300", "ab12cd34"],
    );
  });

  it("uses the env var override for the template name when set", async () => {
    process.env.WHATSAPP_TEMPLATE_NEW_SIGNUP = "custom_signup_template";

    await sendNewSignupAlertTemplate("2348011111111", {
      churchName: "Grace Chapel",
      adminName: "Ruth Adeyemi",
      adminPhone: "2348022222222",
      city: "Lagos",
      size: "300",
      code: "ab12cd34",
    });

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "custom_signup_template",
      "en",
      expect.any(Array),
    );
  });
});

describe("sendOrgApprovedTemplate", () => {
  it("sends the org-approved template with admin name and workspace name", async () => {
    await sendOrgApprovedTemplate("2348011111111", "Ruth Adeyemi", "Grace Chapel — Lagos");

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_org_approved",
      "en",
      ["Ruth Adeyemi", "Grace Chapel — Lagos"],
    );
  });

  it("falls back to 'there' when admin name is empty", async () => {
    await sendOrgApprovedTemplate("2348011111111", "", "Grace Chapel — Lagos");

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_org_approved",
      "en",
      ["there", "Grace Chapel — Lagos"],
    );
  });
});

describe("sendOrgRejectedTemplate", () => {
  it("sends the org-rejected template with church name and reason", async () => {
    await sendOrgRejectedTemplate("2348011111111", "Grace Chapel", "budget exceeded");

    expect(mockSend).toHaveBeenCalledWith(
      "2348011111111",
      "chertt_org_rejected",
      "en",
      ["Grace Chapel", "budget exceeded"],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/whatsapp-templates.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/whatsapp-templates'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/services/whatsapp-templates.ts`:

```typescript
import { sendTemplateMessage } from "@/lib/services/whatsapp";

const LANGUAGE_CODE = "en";

function templateName(envVar: string, fallback: string): string {
  return process.env[envVar] ?? fallback;
}

export async function sendNewSignupAlertTemplate(
  to: string,
  fields: { churchName: string; adminName: string; adminPhone: string; city: string; size: string; code: string },
): Promise<void> {
  await sendTemplateMessage(
    to,
    templateName("WHATSAPP_TEMPLATE_NEW_SIGNUP", "chertt_new_signup_alert"),
    LANGUAGE_CODE,
    [fields.churchName, fields.adminName, fields.adminPhone, fields.city, fields.size, fields.code],
  );
}

export async function sendOrgApprovedTemplate(to: string, adminName: string, workspaceName: string): Promise<void> {
  await sendTemplateMessage(
    to,
    templateName("WHATSAPP_TEMPLATE_ORG_APPROVED", "chertt_org_approved"),
    LANGUAGE_CODE,
    [adminName || "there", workspaceName],
  );
}

export async function sendOrgRejectedTemplate(to: string, churchName: string, reason: string): Promise<void> {
  await sendTemplateMessage(
    to,
    templateName("WHATSAPP_TEMPLATE_ORG_REJECTED", "chertt_org_rejected"),
    LANGUAGE_CODE,
    [churchName, reason],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/whatsapp-templates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-templates.ts src/lib/services/whatsapp-templates.test.ts
git commit -m "feat: add whatsapp-templates wrapper module for the 3 business-initiated messages"
```

---

### Task 3: Wire the new-signup alert into `onboarding-flow.ts`

**Files:**
- Modify: `src/lib/services/onboarding-flow.ts:69-88` (the `notifyPlatformAdmins` function)

**Interfaces:**
- Consumes: `sendNewSignupAlertTemplate` from Task 2 (`src/lib/services/whatsapp-templates.ts`), signature `(to: string, fields: { churchName: string; adminName: string; adminPhone: string; city: string; size: string; code: string }) => Promise<void>`.
- Produces: no new exports — `notifyPlatformAdmins` keeps its existing signature `(pending: PendingOrganization) => Promise<void>` and is still called from `advanceSignupFlow` at line 120.

There is no existing dedicated test file for `onboarding-flow.ts` (confirmed: no `onboarding-flow.test.ts` in the repo, and `approveOrganization`/`rejectOrganization`/`notifyPlatformAdmins` are not mocked or asserted against in `whatsapp-processor.test.ts` — they run their real, Supabase-less no-op implementations there). This task does not add a new test file, matching that existing convention; correctness is covered by Task 2's wrapper-level tests plus the typecheck/full-suite run in Step 3 below.

- [ ] **Step 1: Replace the `sendTextMessage` import and call**

In `src/lib/services/onboarding-flow.ts`, change the import on line 17 from:

```typescript
import { sendTextMessage } from "@/lib/services/whatsapp";
```

to:

```typescript
import { sendNewSignupAlertTemplate } from "@/lib/services/whatsapp-templates";
```

Then replace the entire `notifyPlatformAdmins` function (currently lines 69-88):

```typescript
async function notifyPlatformAdmins(pending: PendingOrganization): Promise<void> {
  const admins = platformAdminPhones();
  if (!admins.length) {
    console.error("PLATFORM_ADMIN_PHONES is not set — new church signup has nowhere to be approved from.");
    return;
  }

  await Promise.allSettled(
    admins.map((phone) =>
      sendNewSignupAlertTemplate(phone, {
        churchName: pending.name,
        adminName: pending.requestedByName,
        adminPhone: pending.requestedByPhone,
        city: pending.requestedCity,
        size: pending.requestedSize,
        code: pending.code,
      }),
    ),
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean). This will fail if `sendTextMessage` was still referenced anywhere else in the file — confirm there are no other usages before moving on (there aren't; `notifyPlatformAdmins` was the only caller in this file).

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all existing test files pass (122+ tests, same count as before this task — this task doesn't add new tests, it changes an internal call site with no dedicated coverage).

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/onboarding-flow.ts
git commit -m "feat: send new-signup alert via WhatsApp template instead of free-form text"
```

---

### Task 4: Wire the org-approved message into `whatsapp-processor.ts`

**Files:**
- Modify: `src/lib/services/whatsapp-processor.ts:601-638` (the APPROVE handler)

**Interfaces:**
- Consumes: `sendOrgApprovedTemplate` from Task 2 (`src/lib/services/whatsapp-templates.ts`), signature `(to: string, adminName: string, workspaceName: string) => Promise<void>`.
- Produces: no new exports — this is a call-site swap only, inside the existing `if (isPlatformAdmin(from))` / `approveMatch` block.

`whatsapp-processor.test.ts` mocks `@/lib/services/whatsapp` in full (`sendTextMessage`, `sendInteractiveButtons`, `downloadMedia` — see lines 4-8 of that file) but does not mock `@/lib/services/whatsapp-templates`, and no existing test in that file exercises the APPROVE code path (it requires `isPlatformAdmin(from)` to be true, which needs `PLATFORM_ADMIN_PHONES` set and a real pending org row, neither of which any current test sets up). Add the mock now so the module resolves cleanly in the test file (an unmocked import of a module that itself imports `whatsapp.ts`'s real `sendTemplateMessage`, which calls `fetch`, would otherwise attempt a real network call if this code path were ever hit in a future test) — this task adds the mock declaration only, not new test cases (no APPROVE-path test exists to trigger it either way).

- [ ] **Step 1: Add the `whatsapp-templates` mock to the test file**

In `src/lib/services/whatsapp-processor.test.ts`, add this mock block immediately after the existing `vi.mock("@/lib/services/ai-service", ...)` block (after line 12, before the `vi.mock("@/lib/services/whatsapp-workspace", ...)` block on line 14):

```typescript
vi.mock("@/lib/services/whatsapp-templates", () => ({
  sendNewSignupAlertTemplate: vi.fn().mockResolvedValue(undefined),
  sendOrgApprovedTemplate: vi.fn().mockResolvedValue(undefined),
  sendOrgRejectedTemplate: vi.fn().mockResolvedValue(undefined),
}));
```

- [ ] **Step 2: Run the test file to confirm it still passes with the new mock in place**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts`
Expected: PASS (all existing tests in this file, unchanged count — the mock is inert until something imports/calls the mocked functions).

- [ ] **Step 3: Replace the activation `sendTextMessage` call**

In `src/lib/services/whatsapp-processor.ts`, add the import. Find the existing import line for `sendTextMessage` near the top of the file (it's imported from `@/lib/services/whatsapp` alongside `sendInteractiveButtons`, `downloadMedia`, etc.) and add `sendOrgApprovedTemplate` and `sendOrgRejectedTemplate` via a new import line right after it:

```typescript
import { sendOrgApprovedTemplate, sendOrgRejectedTemplate } from "@/lib/services/whatsapp-templates";
```

Then replace lines 610-623 (the activation-message block) — currently:

```typescript
        // The requester's activation message is almost always outside the
        // 24h window by design (signup copy itself says approval can take
        // a day or two) -- flagged in the 2026-07-18 onboarding audit as
        // needing a real message template, not fixed here. Wrapped so a
        // delivery failure doesn't prevent the setup flow from being
        // seeded below.
        try {
          await sendTextMessage(
            result.requestedByPhone,
            `Great news, ${result.requestedByName || "there"} — *${result.workspaceName}* is approved and live on Chertt!`,
          );
        } catch (err) {
          console.error("Failed to send activation message:", err instanceof Error ? err.message : err);
        }
```

with:

```typescript
        // The requester's activation message uses a pre-approved WhatsApp
        // template (see docs/superpowers/specs/2026-07-19-whatsapp-template-messages-design.md)
        // since it's almost always outside the 24h session window -- the
        // signup copy itself says approval can take a day or two. Wrapped
        // so a delivery failure doesn't prevent the setup flow from being
        // seeded below.
        try {
          await sendOrgApprovedTemplate(result.requestedByPhone, result.requestedByName, result.workspaceName);
        } catch (err) {
          console.error("Failed to send activation message:", err instanceof Error ? err.message : err);
        }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, same count as before this task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-processor.ts src/lib/services/whatsapp-processor.test.ts
git commit -m "feat: send org-approval message via WhatsApp template instead of free-form text"
```

---

### Task 5: Wire the org-rejected message (with optional reason) into `whatsapp-processor.ts`

**Files:**
- Modify: `src/lib/services/whatsapp-processor.ts:640-654` (the REJECT handler)
- Test: `src/lib/services/whatsapp-processor.test.ts`

**Interfaces:**
- Consumes:
  - `sendOrgRejectedTemplate` from Task 2, signature `(to: string, churchName: string, reason: string) => Promise<void>`.
  - `rejectOrganization` (existing, `whatsapp-workspace.ts`), signature `(code: string) => Promise<{ requestedByPhone: string; name: string } | false>` — unchanged by this task, the reason is captured from the incoming message text, not persisted.
- Produces: the platform-admin `REJECT` command now accepts an optional trailing reason: `REJECT <8-char-code> [reason text]`. No new exports.

- [ ] **Step 1: Write the failing test**

Add this test to `src/lib/services/whatsapp-processor.test.ts`, inside the existing `describe("processWhatsAppMessage", ...)` block (add it after the `"REJECT with reason sends rejection message"` test at line 250-269 — note that existing test covers the *workflow-request* REJECT path, which is a different code path gated by `pendingApproval` session state, not the platform-admin org-rejection path this task changes; this new test covers the platform-admin path specifically):

```typescript
  it("REJECT <code> <reason> from a platform admin sends the org-rejected template with the typed reason", async () => {
    vi.stubEnv("PLATFORM_ADMIN_PHONES", PHONE);
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    const rejectSpy = vi
      .spyOn(workspaceModule, "rejectOrganization")
      .mockResolvedValueOnce({ requestedByPhone: "2348099999999", name: "Grace Chapel" });
    const templatesModule = await import("@/lib/services/whatsapp-templates");
    const templateSpy = vi.spyOn(templatesModule, "sendOrgRejectedTemplate");

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "REJECT ab12cd34 budget exceeded" });

    expect(rejectSpy).toHaveBeenCalledWith("ab12cd34");
    expect(templateSpy).toHaveBeenCalledWith("2348099999999", "Grace Chapel", "budget exceeded");

    vi.unstubAllEnvs();
  });

  it("REJECT <code> with no reason from a platform admin uses a default reason", async () => {
    vi.stubEnv("PLATFORM_ADMIN_PHONES", PHONE);
    const workspaceModule = await import("@/lib/services/whatsapp-workspace");
    vi.spyOn(workspaceModule, "rejectOrganization").mockResolvedValueOnce({
      requestedByPhone: "2348099999999",
      name: "Grace Chapel",
    });
    const templatesModule = await import("@/lib/services/whatsapp-templates");
    const templateSpy = vi.spyOn(templatesModule, "sendOrgRejectedTemplate");

    await skipWelcome();
    await processWhatsAppMessage({ from: PHONE, type: "text", text: "REJECT ab12cd34" });

    expect(templateSpy).toHaveBeenCalledWith("2348099999999", "Grace Chapel", "doesn't fit right now");

    vi.unstubAllEnvs();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts -t "REJECT"`
Expected: FAIL — the current regex `/^reject\s+([a-z0-9]{8})$/i` doesn't match `"REJECT ab12cd34 budget exceeded"` (trailing text breaks the match), so `rejectOrganization` is never called and `rejectSpy`/`templateSpy` assertions fail. The no-reason case also fails because `sendOrgRejectedTemplate` isn't wired in yet — the code still calls `sendTextMessage`.

- [ ] **Step 3: Update the REJECT handler**

In `src/lib/services/whatsapp-processor.ts`, replace lines 640-654 — currently:

```typescript
    const rejectMatch = trimmed.match(/^reject\s+([a-z0-9]{8})$/i);
    if (rejectMatch) {
      const result = await rejectOrganization(rejectMatch[1]);
      if (result) {
        await sendTextMessage(from, "Rejected.");
        try {
          await sendTextMessage(result.requestedByPhone, `Thanks for your interest in Chertt for ${result.name}. We won't be moving forward with this request right now — feel free to reach out if anything changes.`);
        } catch (err) {
          console.error("Failed to send rejection message:", err instanceof Error ? err.message : err);
        }
      } else {
        await sendTextMessage(from, "Couldn't find a pending signup with that code — it may already be resolved.");
      }
      return;
    }
```

with:

```typescript
    const rejectMatch = trimmed.match(/^reject\s+([a-z0-9]{8})(?:\s+(.+))?$/i);
    if (rejectMatch) {
      const reason = rejectMatch[2]?.trim() || "doesn't fit right now";
      const result = await rejectOrganization(rejectMatch[1]);
      if (result) {
        await sendTextMessage(from, "Rejected.");
        try {
          await sendOrgRejectedTemplate(result.requestedByPhone, result.name, reason);
        } catch (err) {
          console.error("Failed to send rejection message:", err instanceof Error ? err.message : err);
        }
      } else {
        await sendTextMessage(from, "Couldn't find a pending signup with that code — it may already be resolved.");
      }
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/whatsapp-processor.test.ts -t "REJECT"`
Expected: PASS (both new tests, plus the pre-existing `"REJECT with reason sends rejection message"` workflow-request test still passes unchanged).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (previous count + 2 new tests from this task).

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/whatsapp-processor.ts src/lib/services/whatsapp-processor.test.ts
git commit -m "feat: send org-rejection message via WhatsApp template, accept optional reason on REJECT"
```

---

### Task 6: Update the design doc's companion checklist (env vars)

**Files:**
- Modify: none in `src/` — this is a documentation-only confirmation task, no code changes.

This task exists to make explicit what the user (not this implementation) still owns after Task 5 lands: the three templates must be approved in WhatsApp Manager before these code paths will succeed in production, and if Meta assigns different template names than the defaults (`chertt_new_signup_alert`, `chertt_org_approved`, `chertt_org_rejected`), the corresponding env var must be set (`WHATSAPP_TEMPLATE_NEW_SIGNUP`, `WHATSAPP_TEMPLATE_ORG_APPROVED`, `WHATSAPP_TEMPLATE_ORG_REJECTED`). No code task is blocked on this — the defaults are the exact names to submit, per the spec.

- [ ] **Step 1: Confirm with the user whether Meta has approved the 3 templates and whether any name differs from the default**

No code change. If a name differs, set the matching env var in the deployment environment (e.g. via `vercel env add WHATSAPP_TEMPLATE_ORG_APPROVED`) — no code redeploy needed since the wrapper functions already read from `process.env` at call time.

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 1+2), all 3 template call sites (Tasks 3/4/5), error handling (verified log-and-continue preserved in Tasks 4/5's diffs), testing (Task 2's wrapper tests + Task 5's REJECT-path tests), REJECT reason capture (Task 5). All spec sections have a corresponding task.
- **Placeholder scan:** No TBD/TODO; every step shows complete code, not descriptions.
- **Type consistency:** `sendTemplateMessage(to, templateName, languageCode, params)` in Task 1 matches its usage in Task 2. `sendNewSignupAlertTemplate`/`sendOrgApprovedTemplate`/`sendOrgRejectedTemplate` signatures in Task 2 match their call sites in Tasks 3/4/5 exactly (same argument order and types).
