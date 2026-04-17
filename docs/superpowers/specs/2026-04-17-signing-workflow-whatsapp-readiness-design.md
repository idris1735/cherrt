# Design: Document Signing Workflow + WhatsApp-Readiness
**Date:** 2026-04-17
**Status:** Approved

## Context

The client has confirmed the MVP should be a **business toolkit** focused on the Toolkit module. The primary long-term interface is WhatsApp — staff will interact with Chertt via WhatsApp Business. The web app serves as the backend and admin panel: records appear here, rich UI actions (like document signing) happen here, and WhatsApp links back to it.

Two immediate gaps to close:
1. The document signing workflow is partially built (CSS exists, types exist) but has no real two-step flow
2. The web app should be structured so the WhatsApp layer slots in without architectural changes

---

## Scope

**In scope:**
- Two-step document signing flow (draft → route → sign)
- Three signing methods: drawn signature, uploaded signature image, approve stamp
- Role-based authorization with optional named assignee
- Signature profile stored per user in Settings
- WhatsApp-readiness: ensuring `runCherttCommand` stays pure and portable

**Out of scope (future):**
- Actual WhatsApp Business API webhook integration
- Supabase persistence (records still live in app state)
- Real push notifications to approvers
- PDF export / letterhead template upload

---

## Architecture — What Changes, What Stays

### What stays
- Chat UI, bubble layout, canvas pane, detail sheet — no structural changes
- `runCherttCommand` in `ai-service.ts` — pure function, no changes needed
- All existing artifact kinds and AI response structure

### What changes
**`SmartDocument` type** — add fields:
```ts
signedBy?: string        // name of person who signed
signedAt?: string        // ISO date string
signatureData?: string   // PNG data URL (drawn/uploaded) or "stamp"
awaitingSignatureFrom: string  // role ("Admin") or person name
```

**`SignatureProfile`** — new object stored per user in localStorage (Supabase Storage when persistence is added):
```ts
drawnSignatureData?: string   // base64 PNG data URL of drawn signature
uploadedSignatureData?: string // base64 PNG data URL of uploaded signature
```

**`WorkspaceSnapshot`** — no changes needed

---

## Document Creation + Routing Flow

1. User types a prompt: *"Draft a letter to our fuel vendor about payment extension"*
2. AI creates the document, chat shows the inline doc card (existing behavior)
3. Immediately below, Chertt sends a **routing bubble** — a second assistant message:
   > *"Routed to Admin for signature. An authorized team member can review and sign."*
   - Contains a status chip: `Awaiting signature · Admin` (or the tagged person's name)
   - If the drafter named someone (*"send to Emeka for signature"*), the AI extracts that name and stores it in `awaitingSignatureFrom`
   - Otherwise defaults to `"Admin"`

4. The document card shows a **"Sign" button** in the doc header — visible only to users with `role === "owner"` or `role === "admin"`
5. Non-authorized users see `Awaiting signature · [Name]` label instead

---

## Signing UI

When an authorized user clicks "Sign":

A modal slides up (uses existing sheet pattern) with three tabs:

### Tab 1 — Draw
- `<canvas>` element, draws with mouse or touch
- "Clear" button resets the canvas
- "Apply signature" saves the canvas as a PNG data URL

### Tab 2 — Upload
- If user has a saved signature in their profile: shows a preview, "Use this" button
- If not: file picker to upload a PNG/JPG, saves to profile for future use
- "Apply signature" attaches the image URL to the document

### Tab 3 — Stamp
- No image — just a formatted text block
- Preview shows: `Approved by [Full Name] · [Date]`
- "Apply stamp" marks the document as signed with type `"stamp"`

### After signing
- Document `signedBy`, `signedAt`, `signatureData` fields are populated
- The "Sign" button in the doc card is replaced by `✓ Signed by [Name]` (`.inlineDocSigned` style)
- Canvas pane preview shows the signature at the bottom of the document body
- A new Chertt chat bubble appears: *"Signed. [Document title] is now authorized and ready to send."*

---

## Authorization Model

| Role | Can draft | Can sign |
|------|-----------|----------|
| `owner` | Yes | Yes |
| `admin` | Yes | Yes |
| `member` / others | Yes | No |

**Named assignee rule:** The drafter can tag a person by name. The routing bubble and `awaitingSignatureFrom` reflect that name. However, the Sign button is still gated by role — the named person must also be an owner/admin to complete signing. This avoids a complex invite/permission system for MVP.

**Signature profile:** Users can save their default signature in Settings (`/w/[slug]/settings`). The Upload tab in the signing modal pre-loads it automatically.

---

## WhatsApp-Readiness

The design ensures zero rework when WhatsApp is connected:

| Web app (now) | WhatsApp (future) |
|---|---|
| Staff types in chat → AI responds | Staff sends WhatsApp message → same `runCherttCommand` called via webhook |
| Routing bubble appears in thread | Chertt sends WhatsApp message to approver's number |
| Approver clicks "Sign" in web app | Approver receives link, opens web app to sign |
| Receipt photo attached via attach button | Staff sends photo in WhatsApp → media URL passed to AI context |
| Approve/reject via sheet actions | Approver replies "APPROVE" or "REJECT" in WhatsApp |

### WhatsApp capability summary (when integrated)

**Fully in WhatsApp:**
- Draft documents, raise requests, log expenses, report issues
- Approve/reject requests (reply APPROVE / REJECT)
- Ask FAQs, recall process docs
- Send receipt photos for expense logging
- Send photos/videos for facility issue reports
- Check inventory levels
- Staff onboarding messages

**Requires web app (WhatsApp links out):**
- Document signing (drawn/uploaded signature)
- Full document preview and PDF export
- Complex form filling
- Records dashboard

---

## Implementation Checklist

1. Extend `SmartDocument` type with `signedBy`, `signedAt`, `signatureData`
2. Add `SignatureProfile` to user profile type
3. Update AI routing logic to emit the routing bubble after document creation
4. Build the Sign modal (3 tabs: Draw / Upload / Stamp) as a new component
5. Wire Sign button visibility to role check in the inline doc card
6. Update canvas pane doc preview to render signature block at bottom
7. Add signature management UI to Settings page (upload/draw/clear default signature)
8. Emit post-sign confirmation chat bubble
