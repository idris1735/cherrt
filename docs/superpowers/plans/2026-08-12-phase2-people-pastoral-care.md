# Phase 2 — People & Pastoral Care — Plan & DeepSeek Prompt

> **Direction by Claude; DeepSeek implements.** Read `docs/DEEPSEEK-HANDOFF.md` + `CHRONICLE.md` §0 first. Each slice below is a small, testable unit: **TDD** (failing test → implement → green), per-task commits, `tsc` + `build` green, update the Chronicle. WhatsApp-first for every capture; the web console only *shows* data (read-only).

## The one principle that governs Phase 2

**Everything hangs off the person spine.** Today several Phase-2 tables (`first_timers`, `department_memberships`, `life_journeys`) store flat `name`/`phone` **text** with no `person_id` — they predate the identity spine and are effectively disconnected records. Phase 2 re-grounds them so every prayer, first-timer, child, department membership, and milestone is a real `people` row you can query across a person's life. **No new Phase-2 table stores a bare name where a `person_id` belongs.**

## What already exists (don't rebuild — extend)

- Tables: `first_timers`, `prayer_requests`, `pastoral_care_requests` (has `person_id`), `life_journeys`, `department_memberships`, `ministry_units`. Agent tools: `capture_prayer_request`, `capture_first_timer`, `request_pastoral_care`, `add_member`, `list_prayer_requests`, `list_first_timers`, `get_top_givers`.
- **Gaps to fix:** flat tables lack `person_id`; `department_memberships.unit_name` is text (not `ministry_unit_id`); `people` is minimal (only `full_name, preferred_name`); **captures log rows but never notify a human**; there is **no children/guardian model**; no pastoral-forms engine; life-journeys is an unused table.

## Data-ownership note (open owner decision)

This plan assumes **Chertt is the system-of-record** (churches enter/capture data here). That is the safe default and does not change the capture model. If owners choose "integrate with existing systems," we add an import/sync slice later. Slice 8 (bulk import) is included and is valuable either way — it de-risks the decision.

---

## Slice 0 — Person-spine normalization (foundation; do first)

**Why:** everything else depends on capture writing a real `person_id`.

- **Migration:** add nullable `person_id uuid references people(id) on delete set null` to `first_timers`, `department_memberships`, `life_journeys` (keep the existing text columns for now — nullable, backfilled opportunistically). Add `ministry_unit_id uuid references ministry_units(id)` to `department_memberships`. Indexes on the new FKs. (Nullable = zero-downtime; no backfill required since the DB was wiped.)
- **Service:** `src/lib/services/identity/people.ts` → `ensurePerson({ workspaceId, fullName, phone? }): Promise<string>` — find-or-create a `people` row (+ a `phone_contacts` row if a phone is given, unverified), returns `person_id`. Reuse from every capture tool so names resolve to real people. (Do **not** auto-verify — only inbound WhatsApp verifies.)
- **Acceptance:** `ensurePerson` is idempotent per (workspace, phone); tools can be pointed at it in later slices; migration applies; tests for find vs create.

## Slice 1 — Member registration + richer profile

- **Migration:** enrich `people` — add `gender text`, `birthdate date`, `address text`, `email text`, `marital_status text`, `joined_at date`, `notes text` (all nullable).
- **Tool:** upgrade `add_member` → `register_member` (keep `add_member` as an alias) capturing name + optional gender/DOB/phone/address/role, via `ensurePerson` + `branch_memberships(role, status='active')`. Role words → slugs (existing map). Confirm-before-write for leadership actions.
- **Console:** church-detail + `/admin/people` show the richer profile fields.
- **Acceptance:** registering a member creates/links one person + one active membership; profile fields persist; role-gated (leaders add others; a person can self-register as `member`).

## Slice 2 — Children & guardianships (Phase-4 prerequisite — high value)

- **Model:** a child is a `people` row with `is_minor=true` + `birthdate`. New table **`guardianships`**: `child_person_id`, `guardian_person_id`, `relationship('parent'|'guardian'|'relative'|'other')`, `is_primary boolean`, `can_pickup boolean default true`, `workspace_id`, `created_at`. Optional child fields on `people` or a `child_profiles` table: `allergies text`, `medical_notes text`, `classroom text`/`age_group text`.
- **Tools:** `register_child` (guardian registers: child name, DOB, allergies/notes, class; links guardian = the sender's person, `is_primary`), `list_children` (leaders/children-workers only). 
- **Console:** children under a church (name, age, guardian, class) on church detail.
- **Acceptance:** a child + a guardianship link are created; a child can have multiple guardians; `can_pickup` defaults sensibly; this data is shaped so Phase-4 check-in can consume it directly (guardian → allowed pickup).

## Slice 3 — First-timers follow-up + convert-to-member

- **Migration:** add `person_id` (Slice 0) + `assigned_to text/uuid` to `first_timers`; keep `follow_up_status('new'|'contacted'|'joined'|'inactive')`.
- **Tools:** enrich `capture_first_timer` to `ensurePerson`; add `convert_first_timer` (→ creates a `member` membership + sets status `joined` + records a "joined church" milestone in Slice 6); `update_first_timer_status`. `list_first_timers` exists.
- **Referral:** on capture, **notify the follow-up team** (see Slice 4's `notifyLeaders`).
- **Acceptance:** capture links a person; convert creates a membership and flips status; leaders see the follow-up queue.

## Slice 4 — Prayer & pastoral care: CLOSE THE REFERRAL LOOP (core rule)

**The important one.** Today capture writes a row and tells the member "a pastor will reach out" — but **no pastor is told.** The bot must **refer to a real human**, never counsel.

- **Service:** `src/lib/services/church/referral.ts` → `notifyLeaders({ workspaceId, roleAtLeast, message })` — resolve the branch's leaders (via `branch_memberships` + role rank, e.g. `pastor`/`dept_leader` and up) and `sendTextMessage` each a concise, privacy-appropriate alert (e.g. "🙏 New pastoral-care request (marriage) from Ada. Reply here to follow up."). Best-effort; never blocks the capture.
- **Wire:** `capture_prayer_request` and `request_pastoral_care` call `notifyLeaders` after insert. Add `person_id` linkage (prayer table may need it). Keep the member-facing reply as a *confirmation of referral*, never a prayer/counsel.
- **Tools:** `list_pastoral_requests` (leaders), `assign_pastoral_request`, `resolve_pastoral_request` (status `open→scheduled→resolved`). Same for prayer (`open→praying→answered→closed`, already in schema).
- **Acceptance:** capturing a prayer/pastoral request sends a WhatsApp alert to the branch's leaders; the member gets a referral confirmation; leaders can list/assign/resolve; **the bot never generates spiritual content** (assert in a test that the reply is a fixed referral string).

## Slice 5 — Pastoral-care forms engine

- **Model:** `pastoral_forms` (seedable form types: `baby_dedication`, `child_naming`, `house_dedication`, `pre_marital`, `training_school`) + `pastoral_form_submissions` (`workspace_id`, `person_id`, `form_type`, `data jsonb`, `status('submitted'|'reviewing'|'scheduled'|'completed')`, `assigned_to`, `created_at`). RLS deny-all.
- **Tools:** `submit_pastoral_form` (form_type + free-form/structured details → `ensurePerson` + submission; `notifyLeaders`), `list_pastoral_forms` (leaders), `update_pastoral_form_status`.
- **Console:** submissions list + detail on the church.
- **Acceptance:** each form type submits, notifies leaders, and is reviewable; `data jsonb` holds per-form fields; adding a new form type needs no schema change.

## Slice 6 — Life journeys / person milestones

- **Model:** repurpose/replace `life_journeys` with a person-timeline: `person_milestones` (`person_id`, `workspace_id`, `type('salvation'|'baptism'|'child_dedication'|'marriage'|'joined_membership'|'bereavement')`, `occurred_on date`, `details jsonb`, `created_at`).
- **Auto-record:** first-timer→member conversion writes `joined_membership`; a completed `baby_dedication` form writes `child_dedication`; etc. Tool `record_milestone` for manual entry (leaders).
- **Console:** a **timeline** on a person's detail page (`/admin/people/[id]` — add this page).
- **Acceptance:** milestones attach to a person and render as a timeline; other slices auto-emit the obvious ones.

## Slice 7 — Join a department (proper form + approval)

- **Migration:** use `person_id` + `ministry_unit_id` on `department_memberships` (Slice 0); status `pending→approved→declined`.
- **Flow:** `request_join_department` (member picks a unit → `pending`) → `notifyLeaders`(the unit's leader) → leader `approve_department_request` / `decline_department_request` → on approve, set membership active (and optionally `branch_memberships.unit`). 
- **Console:** department roster + pending requests on the church.
- **Acceptance:** a member requests, the unit leader is notified and can approve/decline; approval yields an active department membership linked to a real person + unit.

## Slice 8 — Bulk import (optional; de-risks the data-ownership decision)

- A CSV/Excel member import for churches with existing lists: parse → `ensurePerson` per row → membership. Console upload on the church (platform-admin, or creator-initiated later). Idempotent by phone. Only build if owners want system-of-record.

---

## Cross-cutting (every slice)

- **Person-centric:** new/updated rows carry `person_id` + `workspace_id`. Use `ensurePerson`.
- **Referral, never counsel:** prayer/pastoral/forms notify a human via `notifyLeaders`; the bot's member-facing text is a fixed referral confirmation — test that it contains no generated spiritual content.
- **Role-gating:** member self-service captures (register self, prayer, pastoral, join dept, register own child) are open; all `list_*`/leader actions gated by role rank via `toolAccessError`/`minRank`. Children data is sensitive → `dataSensitive` + children-worker/leader only.
- **Tiered access:** creation of members/children etc. should respect `churchApproved(workspaceId)` where it's a leadership write (reuse the existing guard).
- **New tables:** RLS deny-all; service-role access only.
- **Tests:** each tool/service TDD'd with a mocked Supabase; assert the referral-notify fires; assert person linkage.

## Build order & acceptance gate

Slice 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (8 optional). Each ends green (its tests + full suite + `tsc` + `build`) and merged to `main`. **Phase 2 is done when:** a member/child/first-timer can be registered and is a real person; a prayer or pastoral request **pings a real leader on WhatsApp**; the five pastoral forms submit + route; a person has a milestone timeline; joining a department is a real approved flow — all from WhatsApp, all visible in `/admin`.

## What I (Claude) will do alongside

Review each merged slice (verify person-linkage + the referral notify actually fires + tests are honest), and adjust the plan as the Saturday validation answers the open decisions (data ownership, WhatsApp billing for the leader notifications, one-number-vs-many).
