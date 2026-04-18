# Design: WhatsApp Business Integration
**Date:** 2026-04-17
**Status:** Approved

## Context

Chertt is a chat-first business operations platform. The web app serves as the admin panel and rich-UI surface. WhatsApp Business is the primary interface for staff — they interact with Chertt AI through WhatsApp, and the web app handles anything that requires rich UI (document signing, records dashboard, full document preview).

This spec covers the first phase of WhatsApp integration: a reactive chatbot that receives messages, calls `runCherttCommand`, and replies with plain text + web links where needed.

---

## Scope

**In scope:**
- Webhook receiver (`GET` + `POST /api/whatsapp/webhook`)
- WhatsApp message sender service
- Message processor (incoming message → AI → formatted reply)
- CONFIRM / APPROVE / REJECT keyword handling
- Media handling (receipt photos, facility photos passed as AI context)
- Per-phone session state (conversation history + pending confirmation)
- Response formatter (AI result → WhatsApp plain text + optional link)
- Environment variable setup guide

**Out of scope (future):**
- Proactive notifications (web app events → WhatsApp outreach)
- Agentic multi-step tool chaining
- Multi-workspace routing (one number per workspace)
- Phone number registration in the web app (link WhatsApp to Chertt account)
- Scheduled reminders for pending approvals

---

## Provider

**Meta Cloud API (direct)**
- No third-party BSP
- Free per message
- Requires Meta Business verification and webhook registration
- Deployed on Vercel — webhook URL: `https://your-app.vercel.app/api/whatsapp/webhook`

---

## Architecture

### What stays unchanged
- `runCherttCommand` in `ai-service.ts` — pure function, called by the webhook exactly as the web app calls it
- All existing capability registry, intent router, policy guard, and result validator logic
- The `/api/command` web app route — untouched

### New files

| File | Responsibility |
|------|---------------|
| `src/app/api/whatsapp/webhook/route.ts` | GET (verification) + POST (message handler) |
| `src/lib/services/whatsapp.ts` | Send messages via Meta Cloud API |
| `src/lib/services/whatsapp-processor.ts` | Parse message → call AI → format → send reply |
| `src/lib/services/whatsapp-session.ts` | In-memory session store per phone number |
| `src/lib/services/whatsapp-formatter.ts` | Convert AI result objects to plain text + links |

---

## Section 1: Webhook Endpoint

`GET /api/whatsapp/webhook` — Meta verification handshake
- Meta sends: `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`
- If `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN` env var, echo back `hub.challenge`
- Returns 403 if token doesn't match

`POST /api/whatsapp/webhook` — Incoming message handler
- Meta sends all messages here as JSON
- Always return `200 OK` immediately (Meta retries if it doesn't get 200)
- Process the message asynchronously after responding
- Ignore non-message events (status updates, read receipts, delivery reports)

**Payload shape Meta sends:**
```ts
{
  object: "whatsapp_business_account",
  entry: [{
    changes: [{
      value: {
        messages: [{
          from: string,        // sender phone number e.g. "2348012345678"
          type: "text" | "image" | "document" | "audio",
          text?: { body: string },
          image?: { id: string, mime_type: string },
          id: string,
        }]
      }
    }]
  }]
}
```

---

## Section 2: WhatsApp Sender Service

`src/lib/services/whatsapp.ts`

```ts
sendTextMessage(to: string, text: string): Promise<void>
sendTextMessageWithLink(to: string, text: string, url: string, linkLabel: string): Promise<void>
downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }>
```

Calls `https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages` with Bearer token from `WHATSAPP_ACCESS_TOKEN`.

Text messages are capped at 4096 characters (WhatsApp limit). Formatter must stay under this.

---

## Section 3: Session State

`src/lib/services/whatsapp-session.ts`

In-memory Map keyed by phone number. Resets on server restart (acceptable for MVP — moves to Supabase when persistence is added).

```ts
type WhatsAppSession = {
  phoneNumber: string;
  pendingConfirmation?: {
    originalPrompt: string;
    artifactKind: string;
    previewTitle: string;
  };
  pendingApproval?: {
    requestId: string;
    requestTitle: string;
  };
  history: Array<{ role: "user" | "assistant"; text: string }>;
};
```

Session history is capped at the last 10 exchanges to keep AI context manageable.

---

## Section 4: Message Processor

`src/lib/services/whatsapp-processor.ts`

**Main function:** `processWhatsAppMessage(from: string, message: IncomingMessage): Promise<void>`

**Flow:**

```
1. Get or create session for phone number
2. Detect message type:
   a. Keyword: CONFIRM → re-run pending command with confirmed=true
   b. Keyword: APPROVE → approve pending request
   c. Keyword: REJECT → reject pending request
   d. Image/document → download media, pass URL as context to AI
   e. Text → send to runCherttCommand
3. Add message to session history
4. Call runCherttCommand with prompt + history + context
5. Format AI result via whatsapp-formatter
6. Send reply via whatsapp sender
7. Update session (store pending confirmation if needed)
```

**Context object passed to `runCherttCommand`:**
```ts
{
  role: "owner",           // MVP: all WhatsApp users treated as owner
  activeModule: "toolkit", // MVP: always toolkit
  userName: from,          // phone number until phone→profile linking is built
  history: session.history,
}
```

**Keyword detection** (case-insensitive, trim whitespace):
- `"confirm"` or `"yes"` → trigger confirmation
- `"approve"` → approve pending request
- `"reject [reason]"` → reject with optional reason
- `"cancel"` → clear pending state, reply "Cancelled."
- Anything else → new command

---

## Section 5: Response Formatter

`src/lib/services/whatsapp-formatter.ts`

Converts `AiCommandResult` to a plain text string. No markdown. Bullets use `•`.

| AI Result Type | WhatsApp Reply Format |
|---|---|
| Confirmation required | `I'll create "[title]". Reply CONFIRM to proceed, or CANCEL to stop.` |
| Document created | `Done. "[Title]" is ready and routed to [Name] for signature.\n\nSign here: [link]` |
| Request raised | `Request logged: [title]${amount ? ' for ₦'+amount : ''}. [Manager] has been notified.` |
| Request approved | `Approved. [Requester] will be notified.` |
| Request rejected | `Rejected. [Requester] will be notified.` |
| Expense logged | `Expense recorded: ₦[amount] for [category].` |
| Inventory check | `[Item]: [qty] units in stock.` |
| Issue reported | `Issue logged: "[title]". The relevant team has been notified.` |
| FAQ / text response | Full text reply (stripped of markdown) |
| Permission denied | `You don't have permission to do that.` |
| Planned capability | `That feature is coming soon on Chertt.` |
| Error / unknown | `Something went wrong. Please try again or visit [link].` |

**Web link appended when** `signatureRequired`, `requiresWebApp`, or result contains a document/record that needs rich UI.

Link format: `https://[APP_URL]/w/global-hub/chat`

---

## Section 6: Media Handling

When a user sends an image:
1. Extract `image.id` from Meta webhook payload
2. Call Meta API to get the media download URL: `GET /v19.0/{media-id}`
3. Download the image bytes
4. Convert to base64 data URL
5. Pass to `runCherttCommand` as part of context (existing `attachments` field or new `mediaContext` field)

Use cases:
- Receipt photo → expense log
- Facility photo → issue report
- Document photo → general context

If media download fails, reply: *"I couldn't read the image. Please try again or describe what you need."*

---

## Section 7: Environment Variables

```bash
WHATSAPP_ACCESS_TOKEN        # Meta → WhatsApp → API Setup → Temporary/Permanent Access Token
WHATSAPP_PHONE_NUMBER_ID     # Meta → WhatsApp → API Setup → Phone Number ID
WHATSAPP_VERIFY_TOKEN        # Any secret string you choose — set same value in Meta webhook config
NEXT_PUBLIC_APP_URL          # https://your-app.vercel.app (no trailing slash)
```

Add to `.env.local` for development, Vercel dashboard for production.

---

## Section 8: Development Setup

**Testing locally with ngrok:**
```bash
ngrok http 3000
# Copy the https URL e.g. https://abc123.ngrok.io
# Set as webhook URL in Meta: https://abc123.ngrok.io/api/whatsapp/webhook
```

**Meta webhook registration (one-time):**
1. Meta Developer Console → Your App → WhatsApp → Configuration
2. Webhook URL: `https://your-app.vercel.app/api/whatsapp/webhook`
3. Verify Token: value of `WHATSAPP_VERIFY_TOKEN`
4. Subscribe to: `messages`
5. Click Verify — Meta calls your GET endpoint, checks the token, activates the webhook

**Test phone numbers:**
Meta provides free test numbers in the developer console. You can send messages to up to 5 registered test numbers without business verification.

---

## What WhatsApp Can Handle (Full List)

| Action | WhatsApp | Notes |
|---|---|---|
| Draft letter / memo | ✅ | Reply includes signing link |
| Draft invoice | ✅ | Reply includes web link |
| Raise expense request | ✅ | |
| Raise supply request | ✅ | |
| Approve / reject request | ✅ | APPROVE / REJECT keywords |
| Log petty cash | ✅ | |
| Send receipt photo | ✅ | Image → expense context |
| Check inventory | ✅ | |
| Report facility issue | ✅ | Image → issue context |
| Ask FAQ | ✅ | |
| Recall process document | ✅ | |
| Staff onboarding info | ✅ | |
| Document signing | ❌ | Web app only — link sent |
| Full document preview | ❌ | Web app only — link sent |
| Records dashboard | ❌ | Web app only — link sent |

---

## Implementation Checklist

1. Create `src/lib/services/whatsapp-session.ts` — in-memory session store
2. Create `src/lib/services/whatsapp.ts` — send message + download media functions
3. Create `src/lib/services/whatsapp-formatter.ts` — AI result → plain text
4. Create `src/lib/services/whatsapp-processor.ts` — full message processing pipeline
5. Create `src/app/api/whatsapp/webhook/route.ts` — GET verification + POST handler
6. Add environment variables to `.env.local` and Vercel dashboard
7. Test with ngrok + Meta test phone number
