# Instant Demo Mode — Design Spec

**Date:** 2026-07-24
**Status:** Approved (brainstorming), ready for implementation plan
**Goal:** Any phone that texts the WhatsApp number gets an instant, guided, senior-pastor demo of Chertt — a two-step name/church capture, then their *own* fully-seeded demo church, a guided tour with tappable menus, the full church-management cycle, and the ability to try other roles. Built so a pastor client can pick up the phone tomorrow and be wowed with zero setup.

## Context & Motivation

Today an unlinked phone hits `runGuestAgent` (a church-focused onboarding nudge with one tool). That's correct for real onboarding but wrong for a sales demo: the client would have to actually create a church to feel anything. This spec adds a **reversible demo mode** that short-circuits onboarding into an instant, self-contained, richly-seeded experience.

**Decisions locked in brainstorming:**
1. **Isolation:** each tester lands in their *own* fresh demo church, branded with the name they type, pre-seeded with realistic data (so reports/menus look real). Not a shared church.
2. **Role testing:** a switch-role menu + text command lets a tester feel other roles (finance, member, usher, kids) with real permission walls.
3. **Generative scope:** deterministic seed only for tomorrow. The pastor still builds his church live via reactive tool-calling (one record at a time). A bulk generative ("populate a year of giving") tool is explicitly deferred.

## Global Constraints

- **Reversible:** the entire behavior is gated behind `demoModeEnabled()`. When off, the current guest path is byte-for-byte unchanged.
- **Deterministic first impression:** provisioning + seeding never depend on an LLM call. If Gemini is down, setup still works.
- **Self-contained per tester:** one org + one workspace per tester; no cross-tester state bleed.
- **Non-destructive:** provisioning only inserts; it never deletes another tester's data. A phone that's already linked skips onboarding and behaves normally.
- **Persona/formatting rules still apply:** all copy follows the WhatsApp-safe formatting rules (single-asterisk bold, no markdown lists) already in `persona.ts`.

---

## Components

### 1. Demo-mode flag — `src/lib/services/demo/demo-mode.ts` (new)

```ts
export function demoModeEnabled(): boolean {
  return process.env.CHERTT_DEMO_MODE !== "off";
}
```

Default **on** (works on deploy with no env change); set `CHERTT_DEMO_MODE=off` to restore normal onboarding after the sales cycle. One tiny module so the flag has a single source of truth and is trivially mockable in tests.

### 2. Onboarding state machine — reuse the existing `onboarding` union

The session already carries a discriminated-union `onboarding` jsonb column (flows: `new-church-signup`, `post-approval-setup`, `assign-role`). **Add a fourth variant** rather than a new field — no migration, and it matches the established guided-flow pattern:

```ts
| {
    flow: "demo-onboarding";
    step: "name" | "church";
    collected: { name?: string };
  }
```

Separately, add a `demoRole?: string` to the session for the role-testing override (§6). This one *does* need a column — a 3-line migration adding `demo_role text` to `whatsapp_sessions`, wired through `DbRow`/`toSession`/`toDbRow` (same mechanical pattern as `active_workspace_id`).

Flow, handled in `whatsapp-processor.ts` for an **unlinked** phone when `demoModeEnabled()`:

| State | Incoming | Action |
|---|---|---|
| no `onboarding`, unlinked | any text | set `onboarding={flow:"demo-onboarding",step:"name",collected:{}}`; ask *"👋 I'm Chertt — I'll set you up in 10 seconds. First, what's your name?"* |
| `step:"name"` | their reply | `collected.name = trimmed`; set `step:"church"`; ask *"Lovely to meet you, {name}! And what's your church called?"* |
| `step:"church"` | their reply | ack *"🎉 Setting up {church} for you — one sec…"*; call `provisionDemoChurch(phone, name, church)`; clear `onboarding`; set `session.activeWorkspaceId`; send the guided tour (§4) |

Forgiving capture: the whole trimmed message is taken as the answer (people type sentences). Empty/blank → re-ask the same step once.

This intercept runs **before** the guest welcome/`runGuestAgent` path (and before the existing `new-church-signup` onboarding, which the demo-mode flag supersedes) while demo mode is on.

### 3. Provisioning + seed — `src/lib/services/demo/provision-demo.ts` (new)

`provisionDemoChurch(phone, personName, churchName): Promise<{ workspaceId: string; link: PhoneLink }>`

Server-side, service-role Supabase client. Mirrors the proven `seed-demo-church.mjs` + `seed-full-demo.mjs` scripts (already validated against the live schema). Steps:

1. **Provision:** insert `organizations` → `workspaces` (name = `churchName`, unique slug = slugified name + random suffix, city Lagos, tz Africa/Lagos) → `people` (full_name = `personName`) → `phone_contacts` (active, verified) → `branch_memberships` (role `senior_pastor`, active) → `organization_admins` → `whatsapp_phone_links` (role `senior_pastor`). Also seed `giving_categories` (Tithes/Offerings/Building Fund) and `ministry_units` (Choir/Ushering/Media/Children's Ministry).
2. **Seed realistic data** (all workspace-scoped): 12 members (+ the pastor = 13) with roles/birthdays; giving for this month (14 gifts) + last month (8 gifts) so the month-over-month delta is positive; 4 prayer requests; 2 pastoral-care requests; 4 first-timers; 3 upcoming events + 3 registrations; 4 department memberships (2 pending); 4 Sunday services; 2 child check-ins; 4 FAQs (service times / account no. / location / departments); 1 volunteer need; 2 life journeys; 2 pending approvals (`workflow_requests`); 1 open issue (`toolkit_issue_reports`).
3. Return the workspace id + a `PhoneLink` shaped for the welcome.

**Idempotency / safety:** if the phone already has an active `phone_contacts` row, skip provisioning and return the existing link (defensive — the processor already gates on unlinked, but provisioning must be safe if called twice).

**Performance:** batch inserts per table (one request each) to keep setup to a couple of seconds. Send the "Setting up…" ack *before* provisioning so the wait is covered.

### 4. Guided tour + menus — `whatsapp-processor.ts`

After provisioning, send a warm **tour** message then a 3-button starter (reuses `sendInteractiveButtons`):
- Buttons: **Give** · **Prayer** · **Show me around**
- Tour copy: names them senior pastor of `{church}`, says they can type or send a voice note, and points at the buttons / the word *menu*.

**Full menu = interactive list** (`sendInteractiveList`, richer than 3 buttons). Triggered by the "Show me around" button or the text **menu** / **help**. Sections:
- *Do something:* Give · Ask for prayer · Check in a child · Register for an event
- *See reports:* Giving this month · Attendance
- *Try another role:* opens the role menu (§6)

Each list row maps to an existing handler/agent phrasing (e.g. "Give" → the give guide; "Giving this month" → the giving report trigger). No new report logic — these route into paths that already exist.

### 5. Reactive create-tools — fill the two gaps

The pastor will instinctively try to *build his church* live. Two tools he'd reach for don't exist yet; add them so the story is complete (both admin/leader gated, `mutates: true`):

- **`add_member`** (`church-tools.ts` or a small `member-tools.ts`): create a `people` row + `branch_memberships` (role from a small allow-list: member/usher→dept_leader/finance/children/secretary, default member) in the caller's workspace. Args: `name`, optional `role`, optional `phone`. minRank 4 (leaders). Returns a friendly confirmation.
- **`create_event`** (`community-tools.ts`): insert an `event_records` row (title, venue, event_date, guests_expected). Args: `title`, optional `venue` (default "Main Auditorium"), optional `date` (parse loose phrasing → date; default next Sunday), optional `expected`. minRank 4. Returns confirmation; the event then shows in `list_events`.

Everything else a pastor asks (record giving, log a service, check a child in, capture prayer, add an FAQ, request volunteers…) already has a tool — no change needed.

### 6. Role testing — `demoRole` override

- **Menu:** "Try another role" → interactive list: *Senior pastor (back)* · *Finance* · *Member* · *Usher (dept leader)* · *Children's team*. Selecting one sets `session.demoRole` to that slug and replies with a one-line note on what changes (e.g. member → "You're now a member — you can give, ask for prayer, check a child in. Approvals and reports are hidden.").
- **Text command:** `switch to <role>` / `become a member` / `back to pastor` → same effect via a small matcher.
- **Effect:** wherever the linked `AgentContext.role` is built (`whatsapp-processor.ts`, the `return { workspaceId, role: link.userRole … }` site), use `session.demoRole ?? link.userRole`. Also apply `demoRole` to the two gate checks that read `link.userRole` directly (the free-text report gate and the status command) so the walls are felt. Role tools then gate naturally through the existing `toolAccessError`.

### 7. Wiring order in `processWhatsAppMessage`

1. (existing) claim message, resolve links.
2. **New:** if `demoModeEnabled()` and unlinked → run onboarding state machine (§2). If it consumed the turn (asked a question, or provisioned + toured), `return`.
3. (existing) welcome / platform-admin / guided flows / agent — unchanged. `demoRole` is applied when the linked ctx/role is built (§6).
4. **New:** menu/role text triggers (§4/§6) handled among the deterministic pre-agent handlers.

---

## Data Flow

```
Unlinked phone texts (demo mode ON)
  ├─ no onboarding state → ask name              (step=name)
  ├─ step=name  → store name, ask church         (step=church)
  └─ step=church→ ack, provisionDemoChurch(), link+seed, clear state
                → send tour + [Give][Prayer][Show me around]
Now linked as senior_pastor (ctx.role = demoRole ?? senior_pastor)
  ├─ "menu"/"Show me around"      → interactive list menu
  ├─ "Try another role"/switch    → set demoRole, confirm what changed
  ├─ "add Sister Grace as usher"  → add_member tool → real row
  ├─ "put a Youth Night Friday"   → create_event tool → real row
  └─ everything else              → existing agent + tools (real records)
```

## Error Handling

- `provisionDemoChurch` failure → catch, tell the tester *"Something hiccuped setting up — say 'hi' to try again,"* and leave `demoOnboarding` cleared so a retry restarts cleanly. Log server-side.
- Any single seed insert failing must not abort the whole setup: seed inserts are best-effort (the core provision — org/workspace/person/contact/membership/link — must succeed; decorative seed rows wrapped so one failure doesn't kill the church).
- Interactive send (buttons/list) failure → fall back to plain text (existing pattern).
- Unknown `demoRole` value → treated as `member` (fail-closed), never crashes.

## Testing

- **demo-mode flag:** on by default; off when `CHERTT_DEMO_MODE=off`.
- **onboarding state machine:** first text → asks name; name reply → asks church; church reply → calls `provisionDemoChurch` (mocked) and sends a tour with buttons. Blank reply re-asks.
- **demo off:** unlinked phone still hits the existing guest path (regression guard).
- **provisionDemoChurch (mocked Supabase):** inserts workspace, a `senior_pastor` `branch_memberships`, a `whatsapp_phone_links`, and representative seed rows (giving, members); idempotent skip when phone already active.
- **role switch:** "switch to member" sets `demoRole="member"`; the built `AgentContext.role` reflects it; "back to pastor" clears it.
- **new tools:** `add_member` inserts person + membership with the resolved role and is minRank-gated; `create_event` inserts an `event_records` row and is minRank-gated.
- Full suite + `tsc --noEmit` stay green (currently 334 tests).

## Out of Scope (deferred)

- Bulk generative seeding ("fill a year of giving") — a later guarded tool.
- Autonomous / self-directed agent loops (non-deterministic; unsuitable for a live demo).
- A destructive "reset/start over" wipe (the client uses a fresh number; low value for tomorrow).
- Per-role gating of *every* legacy report path — §6 covers the agent ctx + the report/status gates a tester actually feels.

## Files

**New:** `src/lib/services/demo/demo-mode.ts`, `src/lib/services/demo/provision-demo.ts` (+ tests); possibly `src/lib/services/agent/member-tools.ts` (or extend `church-tools.ts`); `supabase/migrations/<date>_demo_role.sql` (adds `demo_role text` to `whatsapp_sessions`).
**Modified:** `src/lib/services/whatsapp-processor.ts` (onboarding intercept, menus, role switch, `demoRole` in ctx), `src/lib/services/whatsapp-session.ts` (`demo-onboarding` union variant + `demoRole` field/mapping), `src/lib/services/agent/community-tools.ts` (`create_event`), `src/lib/services/agent/runtime.ts` (register new tools).
