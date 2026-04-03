# Chertt Chat-First Comprehensive Blueprint

## 1. Objective
Build Chertt as a **chat-first operations platform** where users run workflows in plain language, while backend services create/update records, approvals, documents, and notifications.

This document translates product direction into an executable plan for:
- Auth and profiling personalization
- Chat capability coverage across all modules
- Data and workflow architecture
- Delivery phases and acceptance criteria

---

## 2. Product North Star
One primary interface:
- A simple conversational screen (AI mode + team context)
- Minimal UI chrome
- Task completion by chat, not by deep menu navigation

Core promise:
- Users say what they need
- Chertt interprets intent
- Chertt executes workflow + confirms result + provides traceable records

---

## 3. Auth + Profiling (Current + Target)

## Current
- Simplified signup flow exists (`Names`, `Age`) and routes to workspace chat.
- Session/profile is persisted in local storage for personalized UI.
- Sign-in flow can attach/recover profile identity (name + initials).

## Target
- Keep signup minimal but support production-ready auth profile shape:
  - `full_name`
  - `age` (optional in production policy)
  - `role`
  - `workspace_id`
  - `avatar_initials`
- Ensure profile synchronization between:
  - local session profile
  - Supabase auth metadata
  - membership record

## Acceptance Criteria
- After login, header/avatar/greeting reflect current user identity.
- Identity persists across refresh.
- Switching accounts updates UI identity immediately.

---

## 4. Chat Capability Map

Status legend:
- `Implemented` = working through chat and persisted
- `Partial` = basic support exists but incomplete workflow
- `Planned` = not yet implemented in chat executor

| Module | Capability | Chat Intent Outcome | Status |
|---|---|---|---|
| Business Toolkit | Smart documents | draft letter/invoice, route for approval/signature | Partial |
| Business Toolkit | Requests and approvals | create request, assign approvals, approve/reject | Partial |
| Business Toolkit | Inventory management | check stock, reserve/release, receive stock, reorder warnings | Partial |
| Business Toolkit | Issue/facility reporting | log issue, severity, assignment, status updates | Partial |
| Business Toolkit | Polls/surveys/feedback | create poll, collect responses, close poll | Partial |
| Business Toolkit | Petty cash/expense logging | create expense, attach receipt refs, export-ready records | Partial |
| Business Toolkit | Simple forms | generate form templates and capture submissions | Partial |
| Business Toolkit | Appointments | create/update appointments | Partial |
| Business Toolkit | FAQs | retrieve knowledge snippets/answers | Planned |
| Business Toolkit | Process document recall | fetch process docs by task intent | Partial |
| Business Toolkit | Staff onboarding | generate onboarding checklist and owner routing | Partial |
| Business Toolkit | Staff directory | lookup staff, initiate contact context | Partial |
| ChurchBase | Sunday child check-in | register child check-in/out and guardian flow | Planned |
| ChurchBase | Giving | log/track giving entries | Partial |
| ChurchBase | Registration | register attendee/member | Partial |
| ChurchBase | First timer capture | capture first-timer details + follow-up queue | Planned |
| ChurchBase | Prayer requests | log request + assign pastoral follow-up | Partial |
| ChurchBase | Special care requests | create care request workflow | Partial |
| StoreFront | Catalog | list/add/manage products | Partial |
| StoreFront | Order capture | create order and compute totals | Partial |
| StoreFront | Invoicing/receipts | create invoice and receipt records | Partial |
| StoreFront | Payment collection | generate payment links | Partial |
| StoreFront | Stock tracking | update stock movements | Partial |
| StoreFront | Order management | fulfillment code + status updates | Partial |
| Events | Registration | event registration workflows | Partial |
| Events | Ticketing | issue paid/free ticket | Partial |
| Events | Invitations/reminders | send reminder tasks (adapter-ready) | Planned |
| Events | RSVP management | RSVP capture + reminders | Planned |
| Events | QR/code check-in | check-in status updates | Partial |

---

## 5. Chat Intent Architecture

Each user message should route through:
1. **Classifier**: detect module + intent + entities
2. **Policy gate**: role + workspace checks
3. **Executor**: create/update records
4. **Responder**: natural-language confirmation + next actions
5. **Audit writer**: append system event/activity

## Intent Envelope (target internal shape)
```json
{
  "module": "toolkit",
  "intent": "create_expense",
  "confidence": 0.93,
  "entities": {
    "title": "Diesel top-up",
    "amount": 85000,
    "department": "Facilities"
  },
  "requires_approval": true,
  "requires_clarification": false
}
```

## Response Pattern
- `Action summary`: what Chertt did
- `Record reference`: ID/title/status
- `Next step`: approval pending, signature pending, etc.

---

## 6. Data Model Coverage

## Existing operational tables (already aligned)
- `workflow_requests`
- `smart_documents`
- `toolkit_inventory_items`
- `toolkit_issue_reports`
- `toolkit_expense_entries`
- `toolkit_forms`
- `toolkit_feedback_polls`
- `toolkit_people`
- `toolkit_appointments`
- `products`, `orders`, `payment_links`, `event_records`
- `conversations`, `messages`, `memberships`, `workspaces`

## Gaps to add
1. `toolkit_media_attachments`
- link receipts/photos/videos to expenses/issues/requests

2. `toolkit_faq_entries`
- structured FAQ retrieval for chat mode

3. `toolkit_process_docs`
- process notes/SOP docs with searchable tags

4. `church_checkins`, `church_first_timers`, `church_prayer_requests`
- full ChurchBase coverage

5. `events_rsvp`, `events_invitations`
- reminder + attendance workflows

---

## 7. Role and Approval Policy

Minimum role policy:
- `owner/admin`: full workspace operations
- `approver/finance`: approve financial and procurement requests
- `operations/store-manager/event-manager/pastoral`: scoped workflows

Policy behavior in chat:
- If user lacks permission, assistant replies with:
  - reason
  - who can approve
  - optional “create draft for approver” fallback

---

## 8. AI Mode + Chat Mode

## AI Mode
- natural-language generation and structured command extraction
- asks follow-up clarifications when required entities are missing

## Chat Mode
- teammate-like operational updates in shared conversations
- references records created in AI mode

Shared context:
- same workspace records
- same audit trail
- same approval state

---

## 9. Delivery Plan

## Phase 1 (Now)
- Auth + personalized profile stabilization
- New chat creation reliability
- Clean split UI states (landing vs active conversation)

## Phase 2
- Expand `/api/command` intent coverage for all Toolkit capabilities
- Add clarifying questions for missing data
- Ensure every command writes a traceable record

## Phase 3
- ChurchBase + StoreFront + Events command coverage parity
- Add RSVP/check-in/giving/order orchestration completeness

## Phase 4
- Media attachments (receipts/photos/videos)
- FAQ + process document retrieval improvements
- export/report and adapter readiness (WhatsApp channels)

---

## 10. Demo-Readiness Checklist (Client Facing)

- Personal login shows user name and initials
- `+ New chat` opens a real empty thread
- From chat, user can:
  - draft a document
  - create a request requiring approval
  - log expense
  - log issue
  - check inventory
  - create appointment
  - pull directory record
- Every action returns a clear confirmation and is visible in records/state

---

## 11. Definition of Done for Chat-First

A capability is done when:
1. It can be invoked naturally by at least 3 prompt variants
2. It persists to workspace-scoped data with RLS-safe access
3. It returns explicit confirmation + record status
4. It supports update/retrieval follow-ups in later messages
5. It is covered by a regression test or deterministic manual test script

---

## 12. Immediate Next Implementation Block

Implement command handlers for high-frequency Toolkit intents first:
1. `create_smart_document`
2. `create_request`
3. `approve_request`
4. `log_expense`
5. `log_issue`
6. `check_inventory`
7. `create_appointment`
8. `lookup_staff`
9. `search_process_doc`
10. `create_poll`

This gives maximum demo impact with minimum UI complexity.
