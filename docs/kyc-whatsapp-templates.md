# KYC / onboarding WhatsApp templates — submission checklist

**Why this exists.** WhatsApp only lets a business send **free-form** messages inside a
**24-hour session window** (opened by the user's last inbound message). Anything sent
*outside* that window must be a **pre-approved Meta template**. Our code
(`whatsapp-templates.ts`) tries the template first, then falls back to plain text —
but that plain-text fallback is **blocked by WhatsApp outside the window**.

The real-world failure: a founder submits the onboarding form, a reviewer approves it
**hours or days later** (outside the 24h window), and the approval notice silently
fails. The founder is approved but never told — and post-approval setup only resumes
on *their* next message, so it stalls. **Approving these three templates closes that gap.**

Until they're approved, everything still works *inside* the 24h window (fine for a
controlled demo where the reviewer approves quickly).

---

## The three templates

Create these in **Meta Business Manager → WhatsApp Manager → Message templates**.
Category **Utility** (they're transactional/account updates, not marketing).
Language **English**. Placeholders `{{n}}` are filled **in the exact order below** —
this order matches the code, do not reorder.

### 1. `chertt_org_approved` — founder approved
- **Category:** Utility · **Language:** English
- **Body:**
  ```
  Hi {{1}} 🎉 Great news — {{2}} is approved and live on Chertt! Reply here and we'll finish setting up your church.
  ```
- **Params:** `{{1}}` = admin's name · `{{2}}` = church name
- Sent by `sendOrgApprovedTemplate(to, adminName, workspaceName)`

### 2. `chertt_org_rejected` — application not approved
- **Category:** Utility · **Language:** English
- **Body:**
  ```
  Hi — we reviewed {{1}} and couldn't approve it at this time: {{2}}. Reply here if you'd like to discuss it with us.
  ```
- **Params:** `{{1}}` = church name · `{{2}}` = reason
- Sent by `sendOrgRejectedTemplate(to, churchName, reason)`

### 3. `chertt_new_signup_alert` — internal alert to platform admins
- **Category:** Utility · **Language:** English
- **Body:**
  ```
  ⛪ New church signup: {{1}}. Admin: {{2}} ({{3}}). City: {{4}} · Size: {{5}}. Approve with code {{6}}.
  ```
- **Params (in order):** `{{1}}` church name · `{{2}}` admin name · `{{3}}` admin phone · `{{4}}` city · `{{5}}` size · `{{6}}` approval code
- Sent by `sendNewSignupAlertTemplate(to, {...})`

> **Placeholder rules Meta enforces:** no two `{{n}}` next to each other, none at the very
> start/end of the body, and the sample values you provide at submission must be realistic.
> Provide a sample for each param when submitting or approval is delayed.

---

## After approval — set the env vars

The code reads the template **name** from these (falling back to the default name if unset).
If you keep the exact names above, the defaults already match — but set them explicitly so
config is unambiguous:

```
WHATSAPP_TEMPLATE_ORG_APPROVED=chertt_org_approved
WHATSAPP_TEMPLATE_ORG_REJECTED=chertt_org_rejected
WHATSAPP_TEMPLATE_NEW_SIGNUP=chertt_new_signup_alert
```

Set them in Vercel (Production + Preview) → redeploy.

---

## Verify it works

1. Submit a test onboarding application from a phone.
2. Wait **>24 hours** (so the session window closes), then approve it from the admin console.
3. The approved phone should still receive the approval message — proving the template
   delivers outside the window. (Before approval, it wouldn't have.)
4. Check `whatsapp_send_logs` for the send status.

## Related config to confirm before go-live (not code)
- `MONO_SECRET_KEY` — `live_sk_…` for production CAC/NIN (test_sk = sandbox).
- KYC storage bucket exists with correct RLS (selfie / CAC cert uploads).
- `PLATFORM_ADMIN_EMAILS` set, and those emails have real Supabase auth users (to log into the console).
- `PLATFORM_ADMIN_PHONES` set (else new-signup alerts have nowhere to go).
