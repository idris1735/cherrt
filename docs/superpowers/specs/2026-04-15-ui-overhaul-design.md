# Chertt UI Overhaul — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Source:** Client issue tracker + screenshot review session

---

## Problem

The app has three specific UI failures the client flagged:

1. **Landing screen has no module context** — suggestion cards are generic, no way to tell Chertt which area you're working in before typing
2. **Detail pages are confusing** — issue/request/expense detail pages have progress trackers, response guides, and "next actions" sections that feel like Jira, not Chertt
3. **Modules hub pages are orphaned** — `/modules/` routes show empty placeholder shells (ChurchBase, StoreFront, Events) with no purpose

---

## Changes

### 1. Landing screen — module context pills

**Location:** `src/app/w/[workspaceSlug]/chat/page.tsx` (landing state)

Add a row of module pills between the heading and suggestion cards:

```
What can I help with?

[ 🗂 Toolkit ]  [ ⛪ Church ]  [ 🛍 Store ]  [ 🎟 Events ]

[ Draft letter ]  [ Raise request ]  [ Report issue ]  [ Log expense ]

[ Message Chertt...                                              ↑ ]
```

**Behaviour:**
- Default: Toolkit pill active, showing toolkit suggestion cards
- Tapping a pill:
  1. Highlights that pill (white fill, dark text)
  2. Swaps suggestion cards to that module's actions (4 cards per module)
  3. Inserts a module badge inside the input bar: `🛍 Store ×`
  4. The active module key is passed as `activeModule` in the `/api/command` request body alongside the existing `context` object — NOT prepended to the visible message text
  5. Tapping `×` on the badge clears the active module (sets back to `null`), no pill stays highlighted
- Only modules the workspace has enabled are shown (from `snapshot.workspace.modules`)

**Suggestion cards per module:**

| Module | Card 1 | Card 2 | Card 3 | Card 4 |
|---|---|---|---|---|
| Toolkit | Draft letter | Raise request | Report issue | Log expense |
| Church | Record giving | Log prayer request | Register first timer | Pastoral care |
| Store | Capture order | Add product | Create invoice | Check stock |
| Events | Register guest | Issue ticket | Send invites | Manage RSVP |

**State added:**
```typescript
const [activeModule, setActiveModule] = useState<ModuleKey>("toolkit");
```

When a suggestion card is clicked: fills input bar (existing behaviour from previous sprint). The module badge is included automatically.

---

### 2. Detail pages — minimal card format

**Applies to all 9 record types** in `src/app/w/[workspaceSlug]/modules/toolkit/`:
- `issues/[issueId]/page.tsx`
- `requests/[requestId]/page.tsx`
- `documents/[documentId]/page.tsx`
- `expenses/[expenseId]/page.tsx`
- `feedback/[pollId]/page.tsx`
- `forms/[formId]/page.tsx`
- `appointments/[appointmentId]/page.tsx`
- `directory/[personId]/page.tsx`
- `inventory/[itemId]/page.tsx`

**Every detail page becomes:**

```
← Back to chat                                    [STATUS BADGE]

[Record type label]
[Title]

[ Field 1        ]  [ Field 2        ]  [ Field 3        ]

        [ Update in chat → ]
```

**What is removed from every detail page:**
- Progress tracker / workflow steps
- Response guide / "what to do next"
- Next actions section
- "Back to issues" / "Back to [list]" secondary navigation
- Any AI-generated guidance text

**Only one exit:** `← Back to chat` (links to `/w/[workspaceSlug]/chat`)

**Fields per record type:**

| Record | Field 1 | Field 2 | Field 3 |
|---|---|---|---|
| Issue | Severity | Area | Reported by |
| Request | Type | Amount | Requester |
| Document | Type | Status | Prepared by |
| Expense | Department | Amount | Status |
| Poll | Lane | Audience | Responses |
| Form | Owner | Submissions | — |
| Appointment | When | Owner | — |
| Directory | Title | Unit | Phone |
| Inventory | Location | In stock | Min level |

**"Update in chat →" button** navigates to `/w/[workspaceSlug]/chat`. Both this button and "← Back to chat" go to the same URL — there is only one exit from a detail page. No pre-fill, no special conversation selection — the user lands on the active (most recent) conversation.

---

### 3. Records list page — replace modules hub

**Location:** `src/app/w/[workspaceSlug]/modules/page.tsx`

Replace the current module tiles hub with a flat records list.

**Layout:**
```
Records

[ All ]  [ Toolkit ]  [ Church ]  [ Store ]  [ Events ]

Title                          Type       Status      Module
──────────────────────────────────────────────────────────
Broken pipe in toilet          Issue      Pending     Toolkit
Diesel expense — ₦45,000       Expense    Pending     Toolkit
Vendor letter — Greenfield     Document   Draft       Toolkit
...
```

**Behaviour:**
- Default: shows all records across all modules, newest first
- Filter pills filter by module
- Each row links to its detail page
- Empty state: "Nothing created yet. Go to chat to get started."
- Link in sidebar: A "Records" link added between the chat history list and the wallet balance chip — plain nav item, navigates to `/w/[workspaceSlug]/modules`

**Data source:** `snapshot` (same client state — no new API calls)

**Records shown:**
- documents
- requests
- expenses
- issues
- polls
- forms
- appointments
- directory entries
- inventory items

---

## Files Changed

| File | Change |
|---|---|
| `src/app/w/[workspaceSlug]/chat/page.tsx` | Add module pills, active module state, badge in input |
| `src/app/w/[workspaceSlug]/chat/page.module.css` | Add pill, badge CSS |
| `src/app/w/[workspaceSlug]/modules/page.tsx` | Replace hub with flat records list |
| `src/app/w/[workspaceSlug]/modules/toolkit/issues/[issueId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/requests/[requestId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/documents/[documentId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/expenses/[expenseId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/feedback/[pollId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/forms/[formId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/appointments/[appointmentId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/directory/[personId]/page.tsx` | Minimal card |
| `src/app/w/[workspaceSlug]/modules/toolkit/inventory/[itemId]/page.tsx` | Minimal card |

---

## Out of Scope

- Church/Store/Events detail pages (placeholder shells — left as-is for now)
- Supabase persistence
- Real auth / Google OAuth
- Voice input
- WhatsApp adapter
