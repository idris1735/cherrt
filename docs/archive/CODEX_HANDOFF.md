# Chertt — Complete Technical Handoff

**For:** Codex (or any AI/engineer taking over this project)  
**Date:** 2026-05-10  
**Repo:** https://github.com/idris1735/cherrt  
**Branch:** `main` (all work is committed and pushed here)  
**Deploy:** Vercel, auto-deploys from `main`

---

## 1. What Is Chertt?

Chertt is a **multi-module AI-powered operations platform** for African SMEs, NGOs, and faith-based organisations. It is built as a SaaS product with four modules:

| Module | Purpose |
|--------|---------|
| **Toolkit** | Business operations: requests, approvals, documents, expenses, inventory, issues, staff directory, forms, knowledge base |
| **ChurchBase** | Ministry operations: giving records, care requests, child check-in, pastoral management |
| **StoreFront** | Commerce: products, orders, invoices, payment links |
| **Events** | Event management: registrations, ticketing, check-in |

**The primary UX is conversational.** Staff interact with Chertt through:
1. A web chat interface at `/w/[workspaceSlug]/chat`
2. WhatsApp (the most important channel — the whole product is usable via WhatsApp alone)

The web interface renders structured views of what the AI creates. The AI creates everything — documents, requests, expenses, inventory entries, issue reports, appointments — from plain-language prompts.

**There is a demo mode** (`global-hub` workspace) where any visitor can try all features with a fake ₦500,000 balance, without creating an account.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI | Google Gemini 2.5 Flash via `@google/genai` v1.48.0 |
| WhatsApp | Meta WhatsApp Business Cloud API |
| State | React Context (`AppStateProvider`) + `useReducer` |
| Styling | Global CSS (BEM-ish class names, no CSS-in-JS) |
| Testing | Vitest (56 tests, 9 files — all pass) |
| Deployment | Vercel |

**Key packages:**
```json
"@google/genai": "^1.48.0"
"@supabase/supabase-js": "^2.101.1"
"@tanstack/react-query": "^5.96.1"
"next": "^16.2.2"
"react": "^19.2.4"
"react-markdown": "^10.1.0"
```

Note: `openai` package is installed but not used in any current flows. Ignore it.

---

## 3. Required Environment Variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # bypasses RLS — server-side only

# AI
GEMINI_API_KEY=your-gemini-api-key

# WhatsApp Business Cloud API
WHATSAPP_ACCESS_TOKEN=your-whatsapp-system-user-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-custom-webhook-verify-token

# App
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
```

The `SUPABASE_SERVICE_ROLE_KEY` is critical for WhatsApp features. Without it, phone link lookups fail and all WhatsApp users fall into guest/demo mode.

---

## 4. Project Structure

```
cherrt/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Root — redirects to /auth/onboarding
│   │   ├── globals.css               # ALL styles live here (no CSS modules except a few)
│   │   ├── layout.tsx                # Root layout (theme, providers, PWA)
│   │   ├── manifest.ts               # PWA manifest
│   │   ├── api/
│   │   │   ├── command/route.ts      # POST /api/command — AI execution endpoint
│   │   │   ├── whatsapp/
│   │   │   │   └── webhook/route.ts  # GET+POST /api/whatsapp/webhook
│   │   │   └── user/
│   │   │       └── whatsapp-link/route.ts  # GET+POST+DELETE phone linking
│   │   ├── auth/
│   │   │   ├── onboarding/page.tsx   # Splash/hero (first page new visitors see)
│   │   │   ├── create-account/page.tsx
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── modules/page.tsx      # Pick Toolkit/ChurchBase/StoreFront/Events
│   │   │   └── setup/page.tsx        # Configure workspace (org name, sector, etc.)
│   │   └── w/[workspaceSlug]/
│   │       ├── layout.tsx            # Workspace wrapper (AppStateProvider + guard)
│   │       ├── chat/page.tsx         # AI chat — THE primary web interface
│   │       ├── settings/page.tsx     # Settings (WhatsApp linking, preferences)
│   │       ├── modules/
│   │       │   ├── page.tsx          # Module hub
│   │       │   ├── church/page.tsx
│   │       │   ├── events/page.tsx
│   │       │   ├── store/page.tsx
│   │       │   └── toolkit/
│   │       │       ├── layout.tsx    # Wraps ToolkitShell (sidebar nav)
│   │       │       ├── page.tsx      # Toolkit dashboard
│   │       │       ├── requests/
│   │       │       ├── expenses/
│   │       │       ├── documents/
│   │       │       ├── inventory/
│   │       │       ├── issues/
│   │       │       ├── directory/
│   │       │       ├── forms/
│   │       │       ├── feedback/
│   │       │       ├── appointments/
│   │       │       ├── knowledge/    # FAQ + Process docs + Policies
│   │       │       └── onboarding/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── workspace-access-guard.tsx  # Auth check — redirects unauthenticated users
│   │   │   ├── sign-in-form.tsx
│   │   │   ├── simple-sign-up-form.tsx
│   │   │   ├── setup-form.tsx
│   │   │   └── module-creation-screen.tsx
│   │   ├── shell/
│   │   │   └── workspace-shell.tsx   # Main nav sidebar (left drawer on desktop)
│   │   ├── toolkit/
│   │   │   └── toolkit-shell.tsx     # Toolkit-specific sidebar (12 nav items)
│   │   ├── providers/
│   │   │   ├── app-state-provider.tsx  # Global state context — the heart of the app
│   │   │   ├── toast-provider.tsx
│   │   │   ├── query-provider.tsx
│   │   │   └── pwa-registrar.tsx
│   │   ├── shared/
│   │   │   ├── status-pill.tsx
│   │   │   ├── brand-mark.tsx
│   │   │   └── ...
│   │   └── sign/
│   │       └── sign-modal.tsx        # Signature capture modal (stub/UI only)
│   └── lib/
│       ├── types.ts                  # ALL TypeScript interfaces (canonical source of truth)
│       ├── format.ts                 # formatCurrency, formatMessageTime
│       ├── data/
│       │   ├── seed.ts               # Demo workspace fixture (WorkspaceSnapshot)
│       │   ├── knowledge.ts          # 17 KB articles (FAQs, process docs, policies)
│       │   └── toolkit.ts            # Static lists (onboarding checklist, legacy FAQ strings)
│       └── services/
│           ├── ai-service.ts         # Gemini AI orchestration + SYSTEM_PROMPT
│           ├── supabase.ts           # Browser Supabase client
│           ├── supabase-server.ts    # Server-side Supabase clients (service role)
│           ├── supabase-workspace.ts # All DB queries/mutations for workspace data
│           ├── workspace-service.ts  # getWorkspaceSnapshot() — loads seed or real data
│           ├── profile.ts            # localStorage user profile helpers
│           ├── onboarding-draft.ts   # Onboarding state + bootstrapWorkspaceFromDraft()
│           ├── channel-adapters.ts   # Channel status list (app/web/whatsapp)
│           ├── whatsapp.ts           # WhatsApp Cloud API calls
│           ├── whatsapp-session.ts   # In-memory WhatsApp session state
│           ├── whatsapp-processor.ts # Main WhatsApp message handler
│           ├── whatsapp-formatter.ts # Format AI results for WhatsApp text
│           ├── whatsapp-workspace.ts # WhatsApp ↔ Supabase bridge
│           └── command-engine/
│               ├── capability-registry.ts  # 30+ AI capabilities catalog
│               ├── intent-router.ts        # Keyword → capability matcher
│               ├── policy-guard.ts         # RBAC per capability
│               ├── request-validator.ts    # Validates /api/command payload
│               └── result-validator.ts     # Normalizes Gemini output
├── supabase/
│   └── migrations/                   # Run these IN ORDER in Supabase SQL Editor
│       ├── 20260401_init.sql
│       ├── 20260402_auth_rls_bootstrap.sql
│       ├── 20260403_workspace_uniques.sql
│       ├── 20260404_toolkit_runtime_tables.sql
│       ├── 20260405_conversation_threads.sql
│       ├── 20260406_conversation_update_policy.sql
│       ├── 20260407_bootstrap_chat_cleanup.sql
│       ├── 20260509_whatsapp_workspace.sql
│       └── 20260510_knowledge_base.sql
└── .env.example                      # All required env vars documented
```

---

## 5. Database Schema

All tables live in the `public` schema on Supabase. RLS is enabled on every table.

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workspaces` | Workspace registry | id, slug, name, sector, currency |
| `memberships` | User ↔ workspace join | user_id, workspace_id, role, user_name |
| `conversations` | Chat threads | id, workspace_id, title, mode (ai/team) |
| `messages` | Chat messages | id, conversation_id, speaker, text |

### Toolkit Runtime Tables

| Table | Purpose |
|-------|---------|
| `workflow_requests` | Expense/supply/maintenance approval requests |
| `smart_documents` | Letters, invoices, memos with signature routing |
| `toolkit_inventory_items` | Stock register |
| `toolkit_issue_reports` | Facility/security incident reports |
| `toolkit_expense_entries` | Petty cash log |
| `toolkit_forms` | Form definitions |
| `toolkit_feedback_polls` | Pulse/approval/guest polls |
| `toolkit_people` | Staff directory |
| `toolkit_appointments` | Scheduled appointments |
| `toolkit_knowledge_articles` | FAQs, process docs, policies (type: faq/process/policy) |

### WhatsApp Tables

| Table | Purpose |
|-------|---------|
| `whatsapp_phone_links` | Links a phone number to a user+workspace account |

### RLS Pattern

Most tables use `is_workspace_member(workspace_id)` for SELECT and INSERT/UPDATE. The `whatsapp_phone_links` table allows anon SELECT (so the webhook can look up phones without user auth). The `toolkit_knowledge_articles` table also allows anon read.

For server-side writes (webhook, WhatsApp processor), the `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS.

### Important DB Functions

- `is_workspace_member(workspace_id uuid)` — used extensively in RLS policies
- `bootstrap_workspace(...)` — RPC called during onboarding to create workspace + membership atomically

---

## 6. TypeScript Types (`src/lib/types.ts`)

This is the canonical source of truth. Key types:

```typescript
type Role = "owner" | "admin" | "approver" | "finance" | "operations" | "pastoral" | "store-manager" | "event-manager"
type WorkflowStatus = "draft" | "pending" | "approved" | "in-progress" | "completed" | "flagged"
type ModuleKey = "toolkit" | "church" | "store" | "events"

interface WorkspaceSnapshot {
  workspace: Workspace
  membership: Membership
  conversations: Conversation[]
  requests: WorkflowRequest[]      // module field distinguishes toolkit vs church vs etc.
  documents: SmartDocument[]
  inventory: InventoryItem[]
  issues: IssueReport[]
  expenses: ExpenseEntry[]
  forms: FormDefinition[]
  polls: FeedbackPoll[]
  directory: Person[]
  appointments: Appointment[]
  giving: GivingRecord[]
  paymentLinks: PaymentLink[]
  products: Product[]
  orders: Order[]
  invoices: Invoice[]
  events: EventRecord[]
  registrations: Registration[]
  checkIns: CheckIn[]
  notifications: Notification[]
  // ... more
}

interface AiCommandResult {
  reply: string
  pendingConfirmation?: { summary: string; actionKey: string; previewTitle: string; originalPrompt: string }
  generatedDocument?: SmartDocument
  generatedRequest?: WorkflowRequest
  generatedExpenseEntry?: ExpenseEntry
  generatedIssueReport?: IssueReport
  generatedInventoryItem?: InventoryItem
  generatedPaymentLink?: PaymentLink
  generatedPerson?: Person
  generatedPoll?: FeedbackPoll
  generatedForm?: FormDefinition
  generatedAppointment?: Appointment
  generatedGivingRecord?: GivingRecord
}
```

---

## 7. State Management

The entire app state lives in `AppStateProvider` (`src/components/providers/app-state-provider.tsx`).

**How it works:**
1. `WorkspaceLayout` (server component) calls `getWorkspaceSnapshot(workspaceSlug)` which returns seed data initially
2. `AppStateProvider` receives this as `initialSnapshot`
3. On mount, it tries to load real data from Supabase via `loadWorkspaceSnapshotFromSupabase()`
4. If Supabase loads successfully → dispatches `hydrate` action to replace seed data
5. Real-time subscriptions (via Supabase Realtime) keep data fresh

**Key actions dispatched:**
- `hydrate` — replace all state with fresh Supabase data
- `approve-request` — optimistically mark request approved + persist to DB
- `reject-request` — optimistically mark request flagged + persist to DB
- `apply-ai-result` — add AI-generated artifacts to state
- `upsert-document` — add or update a smart document
- `add-inventory-item` — add a new stock item

**Context API exposed:**
```typescript
const { snapshot, approveRequest, rejectRequest, applyAiResult, ... } = useAppState()
```

**Important:** `workspace-service.ts` currently always returns seed data (`cloneSnapshot()`). The real Supabase load happens client-side in the provider. This means SSR always renders demo data, and real data hydrates on the client.

---

## 8. Auth & Onboarding Flow

### New User Path
```
/ → /auth/onboarding (splash)
  → /auth/create-account (email + password)
  → /auth/modules (pick Toolkit/ChurchBase/StoreFront/Events)
  → /auth/setup?module=... (fill org name, role, team size, etc.)
  → bootstrapWorkspaceFromDraft() → Supabase RPC
  → /w/{slug}/chat
```

### Returning User Path
```
/auth/sign-in → handlePostAuth()
  → if onboarding draft exists → resume setup
  → if last workspace slug in localStorage → go there
  → else → /auth/modules
```

### Auth Guard
`WorkspaceAccessGuard` (client-side, `"use client"`) checks:
- If slug is `global-hub` → always allow (public demo)
- If Supabase not configured → allow (dev without env vars)
- Otherwise → `supabase.auth.getUser()` → redirect to `/auth/sign-in` if no user

**Important:** Auth is checked client-side only (no middleware). Supabase v2 stores tokens in `localStorage`, not cookies, so edge middleware cannot read them.

### Demo Workspace
The `global-hub` slug is the public demo. It:
- Never requires authentication
- Uses seed data (`src/lib/data/seed.ts`)
- Gives visitors a fake ₦500,000 balance
- Lets them try all features (AI creates real-looking artifacts stored only in memory)

---

## 9. AI System — How It Works

The AI layer lives in `src/lib/services/ai-service.ts`.

### Entry Point

```typescript
runCherttCommand(prompt: string, context: CommandExecutionContext, confirmed: boolean): Promise<AiCommandResult>
```

`CommandExecutionContext` carries:
- `role` — user's Role (affects what the AI can create)
- `enabledModules` — which modules the workspace has active
- `history` — last 12 conversation turns
- `memoryContext` — live workspace data + knowledge base articles (injected as text)
- `userName`, `userTitle`, `userOrganization`

### Prompt Construction

The system sends ONE big prompt to Gemini containing:
1. `SYSTEM_PROMPT` — full personality + capability rules + JSON schema (212 lines)
2. `[User identity]` block — name, title, organization
3. `[Recent conversation]` block — history
4. `[Workspace records]` block — memoryContext (live data + KB articles)
5. `Capability: ...` line — what the AI is allowed to do
6. `User: <their message>`

Gemini must respond with **valid JSON only** matching a fixed schema (no markdown fences, no commentary).

### Response Schema (Gemini returns)

```json
{
  "reply": "string",
  "artifactKind": "document|request|payment-link|appointment|form|inventory|issue|expense-log|poll|directory|giving|none",
  "artifactHeadline": "string",
  "documentTitle": "string",
  "documentBody": "string",
  "documentType": "letter|invoice|memo|",
  "requestTitle": "string",
  "requestAmount": null | number,
  "expenseTitle": "string",
  "expenseAmount": null | number,
  ...all artifact fields...
}
```

### Command Engine

Before calling Gemini, the command engine runs:
1. `resolveCapabilityIntent(prompt)` — keyword matching → returns `capabilityId`
2. `evaluateCapabilityAccess(capabilityId, role)` — checks if user's role can use it
3. `getCapabilityById(capabilityId)` — gets capability definition with title

The capability catalog has 30+ entries covering all modules and operations.

### Fallback Behavior

If Gemini fails or the API key is missing, the service has local fallback functions:
- `buildFallbackLetterDraft(prompt, author)` — generates a template letter locally
- `buildFallbackMemoDraft(prompt)` — generates a template memo locally

---

## 10. WhatsApp Integration (Most Critical Feature)

### Architecture

```
Meta Webhook POST → /api/whatsapp/webhook/route.ts
  → parseMetaPayload()
  → processWhatsAppMessage({ from, type, text?, buttonReplyId?, mediaId? })
    → getSession(from) + lookupPhoneLink(from)  [parallel]
    → [route to appropriate handler]
    → [call AI if needed]
    → sendTextMessage() or sendInteractiveButtons()
```

### Dual Mode

Every WhatsApp message is processed in one of two modes based on `lookupPhoneLink(from)`:

**Guest Mode** (unknown phone number):
- Uses in-memory session only (`whatsapp-session.ts`)
- Demo balance of ₦500,000
- AI gets demo knowledge base context
- No Supabase writes

**Workspace Mode** (phone linked to a Chertt account):
- Reads/writes real Supabase tables
- AI gets live workspace data (pending requests, expenses, inventory, issues) + knowledge base
- Full bidirectional approval flow

### Message Types Handled

| Type | Handler | What happens |
|------|---------|--------------|
| First contact (any type) | Welcome flow | Sends welcome message (different for guest vs workspace) |
| Text: "cancel" | `clearPending()` | Clears any pending confirmation/approval state |
| Text: "CONFIRM" or "yes" | `handleConfirm()` | Re-runs last AI command with `confirmed=true` |
| Text: "APPROVE" | Approval handler | Approves pending workflow request, notifies requester |
| Text: "REJECT [reason]" | Rejection handler | Rejects request, sends reason to requester |
| Text: "status" | `handleStatusCommand()` | Returns live workspace summary |
| Text: any other | `runCherttCommand()` | Full AI processing |
| Audio | `handleVoiceNote()` | Downloads → Gemini transcription → processes as text |
| Image | Receipt check → `handleReceiptImage()` | Gemini vision → auto-logs expense if receipt detected |
| Image (non-receipt) | `runCherttCommand()` | AI processes image + text |
| Document | `runCherttCommand()` | AI processes document + text |
| Interactive (button reply) | `handleButtonReply()` | Routes by button ID |

### Button ID Convention

When interactive buttons are sent, button IDs follow this pattern:
- `approve_<requestId>` — approver tapping Approve
- `reject_<requestId>` — approver tapping Reject
- `confirm` — user confirming a document/action
- `cancel` — user cancelling

### Approval Loop (Full Flow)

```
1. Staff: "Request ₦85,000 for emergency diesel"
   → AI creates WorkflowRequest
   → Saved to Supabase (workspace mode) or demo state (guest mode)
   → AI result sent back to staff

2. System looks up workspace owner/admin's phone (getApproverPhone)
   → Sends WhatsApp message with [APPROVE] [REJECT] interactive buttons
   → session.pendingApproval = { requestId, requestTitle, requesterPhone }

3. Manager taps APPROVE button
   → button_reply.id = "approve_<requestId>"
   → approveWorkspaceRequest(requestId) → Supabase update status="approved"
   → Sends confirmation to manager
   → Sends notification to requester's phone

4. If manager taps REJECT
   → rejectWorkspaceRequest(requestId) → status="flagged"
   → Notification with reason sent to requester
```

### Session State (`whatsapp-session.ts`)

Sessions are held **in memory** (a `Map<string, WhatsAppSession>`). They are not persisted across server restarts. Structure:

```typescript
interface WhatsAppSession {
  welcomed: boolean
  demoBalance: number              // starts at 500000
  userName?: string
  history: Array<{ role: "user"|"assistant"; text: string }>  // last 20 turns
  pendingConfirmation?: {
    summary: string
    actionKey: string
    previewTitle: string
    originalPrompt: string
  }
  pendingApproval?: {
    requestId: string
    requestTitle: string
    requesterPhone?: string        // so approver can notify requester
  }
}
```

**Warning:** Vercel serverless functions spin up and down. If you see sessions resetting, it's because the in-memory Map was cleared. For production, sessions should be persisted to Redis or Supabase.

### Knowledge Base in WhatsApp

When the AI processes a WhatsApp message, `memoryContext` includes the full knowledge base:

- Guest mode: `buildKnowledgeContextString(demoKnowledgeArticles)` — always uses the 17 demo articles
- Workspace mode: `loadKnowledgeContext(workspaceId)` — loads from `toolkit_knowledge_articles` table, falls back to demo articles

This means: "What's the process for X?" returns a real, specific answer from the knowledge base.

### Phone Linking (`whatsapp-workspace.ts`)

To enter workspace mode, a user must link their phone:
1. Go to `/w/[slug]/settings` → WhatsApp section
2. Enter phone number → POST `/api/user/whatsapp-link`
3. This creates a row in `whatsapp_phone_links` (phone_number, user_id, workspace_id, workspace_slug, workspace_name, user_name, user_role)
4. Phone normalization: Nigerian numbers starting with `0` are converted to `234`
5. Next time this phone messages → `lookupPhoneLink()` finds it → workspace mode

---

## 11. Toolkit Module

### Navigation

All toolkit pages are wrapped in `ToolkitShell` (`src/components/toolkit/toolkit-shell.tsx`), which provides:
- Sticky topbar with workspace name and "← Back to chat" link
- Left sidebar with 12 nav items (Overview, Requests, Expenses, Documents, Inventory, Issues, Directory, Forms, Feedback, Appointments, Knowledge, Onboarding)
- Active link detection via `usePathname()`

### What Each Section Does

| Section | URL | Status | Notes |
|---------|-----|--------|-------|
| Overview | `/toolkit` | ✅ Full | Dashboard with quick actions, priority items, recent activity |
| Requests | `/toolkit/requests` | ✅ Full | List + detail with in-browser Approve/Reject buttons |
| Expenses | `/toolkit/expenses` | ✅ Full | Petty cash ledger, modal detail, department breakdown |
| Documents | `/toolkit/documents` | ✅ Full | List + letterhead-styled detail viewer (letter/memo/invoice) |
| Inventory | `/toolkit/inventory` | ✅ Full | Stock register with add modal, low-stock alerts |
| Issues | `/toolkit/issues` | ✅ Full | Severity-sorted queue, color-coded cards |
| Directory | `/toolkit/directory` | ✅ Full | Searchable by name/unit/title/phone |
| Forms | `/toolkit/forms` | Read-only | List with submission counts; create via chat |
| Feedback | `/toolkit/feedback` | Read-only | Pulse/approval/guest lane view |
| Appointments | `/toolkit/appointments` | Read-only | Upcoming list; create via chat |
| Knowledge | `/toolkit/knowledge` | ✅ Full | 17 articles, filterable by type, accordion expand |
| Onboarding | `/toolkit/onboarding` | Partial | Hardcoded checklist; no per-user progress tracking |

### Approval Workflow (Web)

Request detail page (`requests/[requestId]/page.tsx`) shows Approve/Reject buttons when:
- `request.status === "pending"` AND
- `snapshot.membership.role` is one of: `owner`, `admin`, `approver`, `finance`

On click:
1. Calls `approveRequest(id)` or `rejectRequest(id)` from `useAppState()`
2. Optimistically updates UI
3. Calls `persistApprovedRequest()` or `persistRejectedRequest()` to write to Supabase
4. Redirects back to request list after 900ms

### Document Letterhead (Web)

Document detail page (`documents/[documentId]/page.tsx`) renders three styled views:
- **Letter** — org letterhead header + reference number + date + body in serif font
- **Memo** — MEMO format header with TO/FROM/SUBJECT/DATE grid + formatted body
- **Invoice** — invoice number + date + structured body

All three read from `document.body` (plain text or markdown from the AI).

---

## 12. `/api/command` Route

**Auth:** Requires a valid Supabase Bearer token for any workspace except `global-hub`. The chat page gets the session token from `supabase.auth.getSession()` and sends it as `Authorization: Bearer <token>`.

**Flow:**
1. Parse and validate payload (`parseCommandRequestPayload`)
2. Check `context.workspaceSlug` — if not `global-hub`, verify Bearer token via `getSupabaseUserClient(token).auth.getUser()`
3. Call `runCherttCommand(prompt, context, confirmed)`
4. Return `AiCommandResult` as JSON

**Payload shape:**
```typescript
{
  prompt: string
  confirmed: boolean
  context: {
    role: Role
    enabledModules: ModuleKey[]
    workspaceSlug: string           // used for auth bypass check
    userName?: string
    userTitle?: string
    userOrganization?: string
  }
  history: Array<{ speaker: string; text: string }>
  memoryContext?: string            // injected by chat page from workspace state
}
```

---

## 13. CSS Architecture

All styles are in `src/app/globals.css` (one large file, ~9000+ lines). CSS modules are only used for:
- `workspace-shell.module.css`
- `chat/page.module.css`
- `settings/page.module.css`
- `records/page.module.css`
- `sign-modal.module.css`

### Toolkit CSS Naming Convention

All toolkit styles use `.tk-` prefix:
- `.tk-shell` — outer wrapper
- `.tk-topbar` — top navigation bar
- `.tk-layout` — flex container (sidebar + main)
- `.tk-sidebar` — left sidebar
- `.tk-sidebar__link` — nav link; `.is-active` for current page
- `.tk-main` — main content area
- `.tk-page` — page root (display: grid, gap: 18px)
- `.tk-card` — content card
- `.tk-card-head` — card header row
- `.tk-card-title` — card title
- `.tk-detail-stat-grid` — 2-3 column stats grid
- `.tk-detail-stat` — individual stat (label + value)
- `.tk-list` — stacked list of cards
- `.tk-page-head` — page header with title + action

### Theme Variables

```css
var(--accent)       /* Orange: #fa8300 */
var(--accent-soft)  /* Light orange bg */
var(--text)         /* Primary text */
var(--muted)        /* Secondary text */
var(--line)         /* Border color */
var(--paper)        /* Page background */
var(--surface)      /* Card background */
```

Dark mode is handled via `data-chertt-theme="dark"` on the root element.

---

## 14. Testing

```bash
npx vitest run        # Run all tests
npx vitest            # Watch mode
npx tsc --noEmit      # Type check only
```

**Current state:** 56 tests, 9 files, all passing.

### Test Files and What They Cover

| File | What it tests |
|------|--------------|
| `whatsapp-processor.test.ts` | Message routing, welcome flow, CONFIRM/CANCEL, APPROVE/REJECT, audio handling, history accumulation |
| `whatsapp-formatter.test.ts` | Each artifact type formatted correctly for WhatsApp text |
| `whatsapp-session.test.ts` | Session creation, history, balance deduction |
| `ai-service.test.ts` | Command execution with mocked Gemini |
| `request-validator.test.ts` | Payload validation edge cases |
| `result-validator.test.ts` | Gemini response normalization |
| `workspace-service.test.ts` | Snapshot generation |
| `module-pills.test.ts` | MODULE_SUGGESTION_CARDS fixture |
| `records-list.test.ts` | Records list logic |

### Mocking Pattern

Tests mock at the module level using `vi.mock()`. Key mocked services:
- `whatsapp` — `sendTextMessage`, `sendInteractiveButtons`, `downloadMedia`
- `ai-service` — `runCherttCommand`
- `whatsapp-workspace` — all DB functions return null/empty (guest mode default)

---

## 15. Deployment

### Vercel Setup
- Connect repo `idris1735/cherrt` to Vercel
- Set all env vars from `.env.example` in Vercel dashboard
- Auto-deploys on push to `main`

### Supabase Setup
Run all migrations **in order** in Supabase SQL Editor:
```
20260401_init.sql
20260402_auth_rls_bootstrap.sql
20260403_workspace_uniques.sql
20260404_toolkit_runtime_tables.sql
20260405_conversation_threads.sql
20260406_conversation_update_policy.sql
20260407_bootstrap_chat_cleanup.sql
20260509_whatsapp_workspace.sql    ← WhatsApp phone linking
20260510_knowledge_base.sql        ← Knowledge base articles
```

### WhatsApp Webhook Setup
1. In Meta Business dashboard: set webhook URL to `https://yourapp.vercel.app/api/whatsapp/webhook`
2. Set verify token to your `WHATSAPP_VERIFY_TOKEN` value
3. Subscribe to: `messages` event

---

## 16. Current State — What's Done vs What's Pending

### Fully Done ✅
- Auth (Supabase email/password + Google OAuth)
- Workspace onboarding (3-step: create → modules → setup)
- AI chat (web) — all 30+ capabilities
- WhatsApp — all capabilities including voice, receipt photo, buttons
- WhatsApp approval loop (staff raises → manager gets buttons → both notified)
- Knowledge base (17 articles, injected into AI context)
- Toolkit sidebar navigation (12 sections)
- Smart Documents with letterhead view (letter/memo/invoice)
- Requests with in-browser Approve/Reject
- `/api/command` auth protection
- `global-hub` demo workspace always public
- All 56 tests passing
- Zero TypeScript errors

### Partially Done / Stubbed
- **Onboarding page** (`/toolkit/onboarding`) — shows hardcoded checklist, no per-user progress tracking
- **Form submissions viewer** — forms show submission counts but no response data
- **Detail pages** (appointments, directory, issues, forms, feedback) — read-only, editing via chat only
- **Signature collection** — `SmartDocument` has `signatureData` field and `SignModal` component exists, but actual signature capture and application is not wired up
- **Media/file attachments** — `mediaCount` and `receiptCount` fields exist but no upload UI; receipt scanning works via WhatsApp only

### Not Started
- **File attachments UI** — upload receipts to expenses, photos to issues from web
- **Form builder UI** — create and manage forms from web (chat only currently)
- **Calendar integration** — appointments exist but no calendar sync (Google/Outlook)
- **Notifications push** — in-app notification UI exists, no browser push
- **ChurchBase, StoreFront, Events modules** — overview pages exist, no detail views
- **Per-workspace knowledge base management** — currently uses demo articles; no UI to add real articles
- **WhatsApp session persistence** — sessions are in-memory only; reset on serverless cold start

### Known Issues / Gotchas

1. **WhatsApp sessions reset on cold start.** Sessions are stored in a `Map` in `whatsapp-session.ts`. Vercel serverless functions can spin down between requests. A user might lose their session context. Fix: persist sessions to Supabase or Redis.

2. **workspace-service.ts always returns seed data.** `getWorkspaceSnapshot()` always clones the seed snapshot. Real Supabase data loads client-side in `AppStateProvider`. This means SSR renders demo data which then gets hydrated. This is intentional but could cause layout shifts.

3. **`global-hub` slug hardcoded in multiple places.** The demo workspace check `if (workspaceSlug === "global-hub")` appears in: `workspace-access-guard.tsx`, `/api/command/route.ts`, `whatsapp-formatter.ts` (via `webLink()`). If you rename the demo workspace, update all.

4. **Supabase anon key fallback.** `getSupabaseServerClient()` uses `SUPABASE_SERVICE_ROLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY`. If service role key is missing, server-side writes (WhatsApp workspace mode) will fail silently — they'll write with anon key which may be blocked by RLS.

5. **Knowledge base for real workspaces.** `loadKnowledgeContext(workspaceId)` loads from `toolkit_knowledge_articles` filtered by workspace_id. If a workspace has no articles yet, it falls back to demo articles. There is no web UI to add real articles yet — only via Supabase SQL or adding chat capability.

6. **Chat page's `memoryContext` is built client-side.** The chat page builds `buildMemoryContext()` from the current snapshot state. This is NOT the same as the WhatsApp processor's `loadWorkspaceContext()`. The chat uses whatever is in the React state (which may be stale seed data). WhatsApp uses live Supabase queries. Align these if real-time accuracy is needed in web chat.

---

## 17. Key Conventions

### Creating Artifacts (AI)
The AI returns artifacts via `artifactKind` in its JSON response. Never add a new artifact type without updating:
1. `GeminiResponse` type in `ai-service.ts`
2. The JSON schema in `SYSTEM_PROMPT`
3. `normalizeAiCommandResult()` in `result-validator.ts`
4. `AiCommandResult` interface in `types.ts`
5. `apply-ai-result` case in `app-state-provider.tsx` reducer
6. `formatAiResult()` in `whatsapp-formatter.ts`
7. `persistWorkspaceAiResult()` in `whatsapp-workspace.ts`

### Adding a New Toolkit Page
1. Create the page file under `src/app/w/[workspaceSlug]/modules/toolkit/[section]/page.tsx`
2. Add a nav item to `NAV_ITEMS` in `toolkit-shell.tsx`
3. Add CSS if needed (use `.tk-` prefix, add to `globals.css`)
4. Data comes from `useAppState()` → `snapshot.[collection]`

### Adding a New API Route
1. Create under `src/app/api/[name]/route.ts`
2. Export named functions: `GET`, `POST`, `DELETE`, etc.
3. For authenticated routes, use `getSupabaseUserClient(token).auth.getUser()`
4. For server-side DB writes, use `getSupabaseServerClient()`

### Role Mapping for WhatsApp
WhatsApp workspace users' roles come from `whatsapp_phone_links.user_role`. The processor maps:
- `"owner"` or `"admin"` → `"owner"` role in AI context
- Everything else → `"operations"` role in AI context

The `Role` type only allows specific values — never pass an arbitrary string.

---

## 18. Running Locally

```bash
# Install
npm install

# Set up env
cp .env.example .env.local
# Fill in all values in .env.local

# Run dev server
npm run dev

# Type check
npx tsc --noEmit

# Tests
npx vitest run

# Build
npm run build
```

For WhatsApp local testing, use ngrok:
```bash
ngrok http 3000
# Set webhook URL in Meta dashboard to: https://[ngrok-url]/api/whatsapp/webhook
```

---

## 19. Git History — What Was Built When

| Commit | What it introduced |
|--------|------------------|
| `abd67f2` | WhatsApp guest welcome flow with demo balance |
| `a7e0295` | Conversational AI personality, guest welcome flow, demo balance, inline doc preview |
| `cf4d78c` | DeepSeek AI + Supabase session persistence for WhatsApp |
| `70a0085` | Revert: remove DeepSeek, keep Gemini |
| `ab7f63f` | Fix: await all session writes so Vercel doesn't kill them |
| `5356b55` | **Full WhatsApp workspace integration** — phone linking, live DB, approval buttons, voice, receipts |
| `c532a82` | **Production hardening** — auth guard, API auth, toolkit sidebar, in-browser approval |
| `f669095` | **Knowledge base** — 17 articles, AI context injection, letterhead document view |

---

## 20. Demo Script (For Client Presentations)

Open WhatsApp and message the business number:

1. **First message** → Gets welcome with demo balance of ₦500,000
2. **"What's the process for requesting office supplies?"** → Gets full step-by-step answer from knowledge base
3. **"Request ₦85,000 for emergency diesel"** → Request raised, manager gets WhatsApp APPROVE/REJECT buttons
4. **Send a receipt photo** → AI scans it, auto-logs as expense
5. **Send a voice note** → AI transcribes and processes it as a command
6. **"Draft a letter to our vendor about payment extension"** → Letter drafted
7. **Go to web: `/w/global-hub/documents`** → See the letter with letterhead styling
8. **"status"** → Dashboard summary of pending items
9. **Type "CONFIRM"** after a document draft → Finalises and saves it

---

*This document reflects the codebase as of commit `f669095` on 2026-05-10. All migrations must be run in Supabase and `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel env vars for production use.*
