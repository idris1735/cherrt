# Cherrt — Product & Engineering Status

> Last updated: April 2026  
> Status: Active development — MVP phase

---

## The North Star

**Simple interface. Insane backend.**

Chertt is a chat-first AI platform for organizations. Everything — drafting letters, raising requests, managing inventory, checking in guests, processing payments — happens through a single chat interface. The user never navigates a complex app. They just talk to Chertt.

The model is: ChatGPT UX × enterprise workflow backend.

---

## What's Actually Built

### Foundation

| Layer | Status | Notes |
|---|---|---|
| Next.js 16 app (App Router) | ✅ | TypeScript, Turbopack |
| Dark/light theming | ✅ | CSS custom properties, localStorage persist |
| Auth flow | ⚠️ | UI complete, not connected to real auth |
| Workspace shell | ✅ | Pure theme wrapper — no topbar |
| App state (client-side) | ✅ | React useReducer + context |
| Supabase persistence | ⚠️ | Integrated but gated behind table availability |

### Chat Interface

| Feature | Status |
|---|---|
| ChatGPT-style sidebar (brand / history / user+theme) | ✅ |
| New chat button | ✅ |
| Conversation history list | ✅ |
| Auto-create first conversation on load | ✅ |
| Animated greeting (typewriter) | ✅ |
| Suggestion cards on landing | ✅ |
| Message thread (user + assistant bubbles) | ✅ |
| Three-dot thinking animation | ✅ |
| Inline action cards (clickable artifacts) | ✅ |
| Writing canvas (split view for documents) | ✅ |
| Canvas auto-save with debounce | ✅ |
| Conversation auto-naming from first message | ✅ |
| Conversation naming from artifact title | ✅ |
| Sidebar collapse / expand | ✅ |
| Mobile responsive (sidebar overlay) | ✅ |

### AI Engine

| Component | Status |
|---|---|
| Intent router (prompt → capability + confidence) | ✅ |
| Capability registry (all 4 modules) | ✅ |
| Policy guard (role-based access) | ✅ |
| Request validator | ✅ |
| Result sanitizer/normalizer | ✅ |
| Business Toolkit executors | ✅ |
| ChurchBase executors | ✅ |
| StoreFront executors | ✅ |
| Events executors | ✅ |
| Gemini integration (primary AI) | ✅ |

### Business Toolkit — Detail Pages

| Feature | Chat AI | List Page | Detail Page |
|---|---|---|---|
| Smart documents (letter/invoice/memo) | ✅ | ✅ | ✅ |
| Requests / approvals | ✅ | ✅ | ✅ |
| Issues / facility reporting | ✅ | ✅ | ✅ |
| Inventory management | ✅ | ✅ | ✅ |
| Expense / petty cash logging | ✅ | ✅ | ✅ |
| Polls, surveys, feedback | ✅ | ✅ | ✅ |
| Forms | ✅ | ✅ | ⚠️ basic |
| Appointments / calendar | ✅ | ⚠️ basic | ❌ |
| Staff directory | ✅ | ✅ | ✅ |
| Records (global search) | ✅ | ✅ | — |

### ChurchBase, StoreFront, Events

| Module | Chat AI | UI |
|---|---|---|
| ChurchBase (giving, care, check-in, registration) | ✅ | ❌ placeholder shell only |
| StoreFront (catalog, orders, invoices, payments) | ✅ | ❌ placeholder shell only |
| Events (registration, ticketing, check-in, RSVP) | ✅ | ❌ placeholder shell only |

---

## What's Broken or Missing

### 🔴 Critical

**1. No real database**  
Everything is client-side seed data. Supabase integration exists in code but is gated behind `isTableAvailable()` checks. If tables aren't deployed, nothing persists. A refresh wipes all AI-created items. This is the #1 blocker before any real users can use the product.

**2. No real auth**  
Sign-in and workspace creation flows exist in the UI but don't connect to a real auth provider. All sessions use the same seed workspace. Multiple users can't use the platform.

**3. AI responses don't render markdown**  
The AI generates responses with structure (bullets, bold, headers) but the chat renders them as plain text. Everything looks like a wall of text. Every response needs to be displayed with proper markdown rendering.

### 🟡 High Priority

**4. Hydration race condition on document detail**  
When navigating from chat to a document's detail page, a loading state now delays `notFound()` by 1.5 seconds. This is a workaround — the real fix is proper persistence before navigation.

**5. Module detail pages (ChurchBase / StoreFront / Events) are empty**  
The AI can create records for all 4 modules, but there's nowhere to VIEW them outside of chat. These modules need full detail UIs comparable to Business Toolkit.

**6. Inline action cards need completion**  
When AI creates something, an action card appears in chat. Cards work well for documents, requests, and issues. But cards for: appointments, forms, polls, directory entries, payment links — all route to list pages, not the specific item. Items need individual detail routes.

**7. File/media attachments not built**  
The spec calls for photo/video uploads in facility reports and expense receipts. The attach button in the composer is a placeholder (does nothing). This is core to the reporting workflow.

**8. No confirmation step before executing**  
The AI executes actions immediately. For anything consequential (approvals, payments, document signing), there should be a "Chertt is about to do X — confirm?" step before execution.

### 🟢 Medium Priority

**9. Chat mode vs AI mode not built**  
The spec describes two modes: AI mode (executes automatically when confident) and Chat mode (clarifies before acting). Currently everything is AI mode with no distinction.

**10. Voice input not built**  
The spec mentions voice as an input method. Not started.

**11. WhatsApp adapter not built**  
The channel adapter architecture exists but no WhatsApp implementation. Planned for after web flows are stable.

**12. Staff directory "initiate call/chat" not built**  
Directory profiles are viewable but clicking "call" or "chat" does nothing.

---

## Architecture Decisions (The Why Behind the What)

### Why chat is the only interface
Every workflow in Chertt maps to a conversation. Requesting supplies is a message. Approving it is a message. Logging an issue is a message. Building per-feature UIs for each workflow creates complexity that defeats the purpose. The AI handles disambiguation, the backend handles business logic, the chat handles everything the user sees.

### Why the AI engine uses a capability registry instead of a giant prompt
Pure prompt engineering breaks under scale. As capabilities grow, prompts become unpredictable. The registry approach (intent classification → typed tool execution → result normalization) keeps the AI layer thin and the business logic layer testable. Tests cover 20 scenarios and pass.

### Why client-side state + async Supabase sync
Immediate UI responsiveness. The user gets feedback instantly (their message appears, Chertt starts typing) without waiting for a round trip to the database. Supabase syncs in the background. The known weakness: hydration can overwrite optimistic state — fixed properly when we add merge-on-hydrate instead of replace-on-hydrate.

### Why no topbar
A topbar + sidebar creates double navigation and eats vertical space. The sidebar IS the navigation. Everything else is the workspace. This matches Claude.ai, ChatGPT, and Linear — products that got this right.

---

## UI Principles (Non-Negotiable)

1. **Chat is the primary surface.** Every action the user takes should work from the chat input. Every other UI is supplementary.

2. **Action cards, not page navigation.** When AI creates something, show a compact card in the message thread. Clicking it opens a modal or slide-over. Do not navigate away from the chat.

3. **Every state is designed.** Empty state, loading state, error state, success state — all have specific UI. No bare spinners, no un-styled error messages.

4. **Mobile-first.** Most Chertt users will be on phones. Every UI must work at 375px width before it's considered done.

5. **Confirmation before consequences.** If an action sends an email, moves money, or changes approval status — show a confirmation step. Never fire-and-forget on consequential actions.

6. **AI responses are formatted.** Bullet points render as bullets. Bold text renders bold. Headers create visual hierarchy. Plain text walls are not acceptable.

---

## What to Build Next (Priority Order)

### Sprint 1 — Make the core loop airtight

These are the things that make the existing experience actually work properly.

- [ ] **Markdown rendering in chat** — Install `react-markdown` or `marked`, render AI responses with proper formatting. This changes the feel of the entire product.
- [ ] **Modal/sheet for action cards** — Instead of navigating to a detail page, clicking an action card opens a slide-over with the full detail. The user stays in chat. Works for: requests, issues, expenses, documents.
- [ ] **Confirmation step** — Before executing: document routing, request approval, payment collection — show a confirmation card in the chat ("Chertt will create an expense request for ₦85,000 for Facilities. Send?")
- [ ] **Deploy Supabase schema** — Get the tables live so data actually persists. This is the most impactful single thing for demo readiness.

### Sprint 2 — ChurchBase, StoreFront, Events UIs

Each of these needs the same treatment Business Toolkit got:
- List views for each entity type
- Detail view for each entity
- Action cards that link to those views
- AI capabilities that feel real (actual data appears in UI after chat command)

### Sprint 3 — Auth and multi-user

- Real sign-in (email/magic link or Google)
- Workspace creation (the onboarding flow needs to connect to real data)
- Invite team members
- Role-based access (the policy guard logic is already built — wire it to real roles)
- Per-user conversation history

### Sprint 4 — Attachment and media

- Image upload in the chat composer
- Attach images to facility/issue reports
- Attach receipts to expense entries
- Photos display inline in chat messages

### Sprint 5 — Channels

- WhatsApp adapter using the same capability registry
- Push notifications (web + mobile)
- PWA installable shell
- Voice input (Web Speech API)

---

## Capability Matrix (Full Picture)

| Capability | Spec | Chat AI | Detail UI | Persistence |
|---|---|---|---|---|
| **Business Toolkit** | | | | |
| Smart documents (draft/sign/route) | ✅ | ✅ | ✅ | ⚠️ |
| Requests and approvals | ✅ | ✅ | ✅ | ⚠️ |
| Inventory management | ✅ | ✅ | ✅ | ⚠️ |
| Facility/issue reporting | ✅ | ✅ | ✅ | ⚠️ |
| Polls, surveys, feedback | ✅ | ✅ | ✅ | ⚠️ |
| Expense/petty cash logging | ✅ | ✅ | ✅ | ⚠️ |
| Simple forms | ✅ | ✅ | ⚠️ | ⚠️ |
| Appointments / calendar | ✅ | ✅ | ⚠️ | ⚠️ |
| FAQs / process docs | ✅ | ✅ | ❌ | ⚠️ |
| Staff onboarding | ✅ | ✅ | ❌ | ⚠️ |
| Staff directory | ✅ | ✅ | ✅ | ⚠️ |
| **ChurchBase** | | | | |
| Child check-in | ✅ | ✅ | ❌ | ⚠️ |
| Giving / donations | ✅ | ✅ | ❌ | ⚠️ |
| Registration (events/conferences) | ✅ | ✅ | ❌ | ⚠️ |
| First-timer capture | ✅ | ✅ | ❌ | ⚠️ |
| Prayer requests | ✅ | ✅ | ❌ | ⚠️ |
| Pastoral care | ✅ | ✅ | ❌ | ⚠️ |
| **StoreFront** | | | | |
| Product catalog (~20 items) | ✅ | ✅ | ❌ | ⚠️ |
| Order capture | ✅ | ✅ | ❌ | ⚠️ |
| Invoicing and receipts | ✅ | ✅ | ❌ | ⚠️ |
| Payment collection / payment links | ✅ | ✅ | ❌ | ⚠️ |
| Stock tracking | ✅ | ✅ | ❌ | ⚠️ |
| Order management + codes | ✅ | ✅ | ❌ | ⚠️ |
| **Events** | | | | |
| Registration | ✅ | ✅ | ❌ | ⚠️ |
| Ticketing (paid + free) | ✅ | ✅ | ❌ | ⚠️ |
| Invitations and reminders | ✅ | ✅ | ❌ | ⚠️ |
| RSVP management | ✅ | ✅ | ❌ | ⚠️ |
| QR / code check-in | ✅ | ✅ | ❌ | ⚠️ |

**Legend:**
- ✅ Done and working  
- ⚠️ Partial / gated / stubbed  
- ❌ Not built yet

---

## Tech Stack Reference

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | CSS Modules (custom properties for theming) |
| AI | Google Gemini (via AI SDK) |
| Database | Supabase (PostgreSQL) |
| State | React useReducer + Context |
| Testing | Vitest (20 tests, all passing) |
| Build | Turbopack |

---

## Files You Care About

```
src/
  app/
    w/[workspaceSlug]/
      chat/page.tsx              — The entire product UX
      chat/page.module.css       — Chat layout styles
      modules/toolkit/           — Business Toolkit detail pages
  components/
    providers/
      app-state-provider.tsx     — All client state + dispatch
    shell/
      workspace-shell.tsx        — Theme wrapper + ThemeContext
  lib/
    services/
      ai-service.ts              — Gemini integration + module routing
      command-engine/
        capability-registry.ts   — All 4 modules, all capabilities
        intent-router.ts         — Prompt → intent classification
        policy-guard.ts          — Role + module access control
        request-validator.ts     — Input validation
        result-validator.ts      — Output sanitization
    data/
      seed.ts                    — Demo data (replace with real DB)
    types.ts                     — All TypeScript types

docs/
  modules-engine.md              — AI engine documentation

CHERRT_STATUS.md                 — This file
```

---

## What "Done" Looks Like for MVP

A user can:
1. Open Chertt on their phone (installable PWA)
2. Sign in with their email
3. See their workspace with conversations from previous sessions
4. Type in plain English: "Log a facility issue — the AC in the main hall is broken, photo attached"
5. Chertt confirms, creates the issue, names the chat "AC breakdown – main hall"
6. Tap the action card in chat to see the full issue detail
7. The facilities manager gets a notification
8. The facilities manager replies in the same chat or approves from their phone
9. Everything is logged, auditable, and searchable

That's the loop. Everything we build should serve that loop.

---

*This document is for the development team. Update it as things change. The goal is that anyone who reads it knows exactly where we are and what to do next — without asking.*
