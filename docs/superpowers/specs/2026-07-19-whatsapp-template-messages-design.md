# WhatsApp Message-Template Infrastructure — Design

**Date:** 2026-07-19
**Status:** Approved, implementation starting
**Related:** `docs/superpowers/specs/2026-07-18-whatsapp-native-onboarding-design.md`

## Problem

Three places in the onboarding flow business-initiate a WhatsApp message to a phone number that
has not messaged Chertt within the current 24-hour session window. WhatsApp Cloud API rejects
free-form `sendTextMessage` calls outside that window — these sends need pre-approved Meta message
templates instead.

The three sends:

1. `notifyPlatformAdmins` (`onboarding-flow.ts`) — pings the platform-admin allowlist when a new
   church signup comes in. The admin has very likely never messaged Chertt recently, if ever.
2. Activation message (`whatsapp-processor.ts`, APPROVE handler) — tells the requester their church
   was approved. Already flagged in-code as almost always outside the session window, since the
   signup confirmation copy itself says approval can take a day or two.
3. Rejection message (`whatsapp-processor.ts`, REJECT handler) — same issue, on decline.

Everything else in the app only replies inside an already-active session (a user just messaged in),
so this pass covers exactly these three and nothing else.

## Architecture

One generic primitive, `sendTemplateMessage(to, templateName, languageCode, params)`, added to
`whatsapp.ts` alongside the existing `sendTextMessage` / `sendInteractiveButtons` / `sendInteractiveList`
— same `postToGraph` plumbing, just a `type: "template"` payload instead of `type: "text"`.

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

A new module, `whatsapp-templates.ts`, holds three named wrapper functions — one per message. Each
pins the template name (overridable via an env var, since Meta may require a rename on
resubmission) and builds the ordered `params` array from typed fields, so call sites never
hand-assemble a positional array themselves.

```typescript
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

## Templates — exact copy to submit in WhatsApp Manager

All three: category **UTILITY** (each is tied to a specific transactional event, not promotional —
faster/cheaper review than MARKETING), language **English**.

1. **`chertt_new_signup_alert`** → platform admins
   > New church pending approval.
   >
   > Church: {{1}}
   > Contact: {{2}} ({{3}})
   > City: {{4}}
   > Size: ~{{5}} members
   >
   > Code: {{6}}
   > Reply APPROVE <code> or REJECT <code> to decide.

   Params in order: church name, admin name, admin phone, city, size, code.

2. **`chertt_org_approved`** → requester, on approval
   > Great news, {{1}} — {{2}} is approved and live on Chertt! Message us here anytime to get started.

   Params: admin name, workspace name.

3. **`chertt_org_rejected`** → requester, on rejection
   > Thanks for your interest in Chertt for {{1}}. We won't be moving forward with this request right now: {{2}}. Feel free to reach out if anything changes.

   Params: church name, reason.

## Data flow / call-site changes

Three edits, each swapping a `sendTextMessage` call for the matching template wrapper — no other
logic in these flows changes.

- `onboarding-flow.ts` `notifyPlatformAdmins`: replace the `sendTextMessage(phone, message)` call
  (inside the existing `Promise.allSettled` fan-out) with `sendNewSignupAlertTemplate(phone, {...})`.
- `whatsapp-processor.ts` APPROVE handler (~line 617): replace the activation `sendTextMessage` call
  with `sendOrgApprovedTemplate(result.requestedByPhone, result.requestedByName, result.workspaceName)`,
  inside the same existing try/catch-and-continue wrapper.
- `whatsapp-processor.ts` REJECT handler (~line 640-649): the code-only regex
  `/^reject\s+([a-z0-9]{8})$/i` becomes `/^reject\s+([a-z0-9]{8})(?:\s+(.+))?$/i`, with the second
  capture group as an optional reason (default: `"doesn't fit right now"` if the admin doesn't type
  one). Replace the rejection `sendTextMessage` call with
  `sendOrgRejectedTemplate(result.requestedByPhone, result.name, reason)`.

## Error handling

Log and continue — matches the existing pattern already in place around the activation message (a
delivery failure is caught, logged via `console.error`, and does not block the rest of the
approve/reject flow, e.g. the org still flips to active/rejected and setup flow still gets seeded).
No retry queue.

## Testing

New `whatsapp-templates.test.ts`, mocking `sendTemplateMessage` the same way `whatsapp.ts` is
already mocked in `whatsapp-processor.test.ts`. Asserts each wrapper calls it with the correct
template name and params in the correct order. Existing tests are unaffected — none currently
exercise the signup/approve/reject send paths (per the comment in `whatsapp-processor.test.ts`,
`approveOrganization`/`rejectOrganization` keep their real, Supabase-less no-op implementations in
tests today).

## Explicitly out of scope

- Any message type beyond these three (confirmed with the client — everything else replies inside
  an already-active session).
- A retry/delivery-queue mechanism for failed template sends.
- Non-English template languages.
