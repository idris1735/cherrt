# Chertt Modules Engine

## Objective
Convert Chertt from keyword-style command handling into a structured command engine that can scale across:
- Business Toolkit
- ChurchBase
- StoreFront
- Events

The engine should keep chat simple while backend workflows become robust, auditable, and role-aware.

## Current Foundation (Implemented)
- `capability registry`
  - Source of truth for supported capabilities
  - Each capability has:
    - `id`
    - `module`
    - `title`
    - `status` (`live` or `planned`)
    - keyword signals
- `intent router`
  - Resolves user prompt to a capability with confidence + matched keywords
- `policy guard`
  - Checks role-based capability access before execution
- `module availability check`
  - Blocks execution when module is not enabled in workspace
- `planned-capability handling`
  - Returns clear response for capabilities not yet switched to live

## Runtime Flow
1. User sends chat message.
2. `/api/command` receives prompt + context (`role`, enabled modules).
3. Engine resolves capability intent.
4. Engine validates role access.
5. Engine validates module availability.
6. If capability is `planned`, return roadmap response.
7. If capability is `live`, execute via:
   - Gemini structured response (primary)
   - deterministic fallback handlers (safe fallback)
8. Return result and generated artifacts to UI/state/persistence.

## Live Toolkit Capabilities
- `toolkit.smart-documents`
- `toolkit.requests-approvals`
- `toolkit.inventory-management`
- `toolkit.issue-reporting`
- `toolkit.polls-feedback`
- `toolkit.expense-logging`
- `toolkit.simple-forms`
- `toolkit.appointments`
- `toolkit.faq`
- `toolkit.process-recall`
- `toolkit.staff-onboarding`
- `toolkit.staff-directory`

## Planned Capabilities (Cataloged)
### ChurchBase
- child check-in
- giving
- registration
- first timer capture
- prayer requests
- pastoral care requests

### StoreFront
- catalog
- order capture
- invoicing/receipts
- payment collection
- stock tracking
- order management

### Events
- registration
- ticketing
- invitations/reminders
- RSVP management
- guest check-in

## Artifact Coverage in Engine
The AI result model now supports:
- documents
- workflow requests
- payment links
- appointments
- forms
- inventory items
- issue reports
- expense entries
- polls
- directory people

## Next Iteration
1. Replace keyword intent routing with model-assisted classification (`capability_id`, `confidence`, `needs_clarification`).
2. Introduce action schemas with strict validation (`zod`) before DB writes.
3. Add human-in-the-loop approval gates for sensitive actions.
4. Add media upload flow for issue reports + expense receipts.
5. Add workflow event bus for notifications and audit trails.
6. Add channel adapters (WhatsApp/voice) against same engine contracts.

