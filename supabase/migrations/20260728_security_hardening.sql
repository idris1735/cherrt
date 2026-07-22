-- Security hardening (Fable review, 2026-07-22): person-id links for recall,
-- Paystack idempotency, an agent audit log, and a per-workspace agent kill
-- switch. All additive; nullable columns so existing rows and legacy-resolved
-- callers stay null.

-- 1. Link church records to the person (stable id) so recall/lookup no longer
-- matches by display-name string (which cross-contaminates same-named members
-- and leaks their prayer/giving into each other's "memory").
alter table public.prayer_requests add column if not exists person_id uuid references public.people(id) on delete set null;
alter table public.pastoral_care_requests add column if not exists person_id uuid references public.people(id) on delete set null;
alter table public.life_journeys add column if not exists person_id uuid references public.people(id) on delete set null;
alter table public.giving_records add column if not exists person_id uuid references public.people(id) on delete set null;
create index if not exists prayer_requests_person_idx on public.prayer_requests (person_id);
create index if not exists pastoral_care_requests_person_idx on public.pastoral_care_requests (person_id);
create index if not exists life_journeys_person_idx on public.life_journeys (person_id);
create index if not exists giving_records_person_idx on public.giving_records (person_id);

-- 2. Paystack idempotency: a payment reference, unique per workspace, so a
-- retried webhook (Paystack retries on non-2xx/timeout) can't double-count a gift.
alter table public.giving_records add column if not exists payment_reference text;
create unique index if not exists giving_records_ref_unique
  on public.giving_records (workspace_id, payment_reference)
  where payment_reference is not null;

-- 3. Agent tool audit log — who called what tool, with what args, and the
-- outcome. For money and children this must be first-class and queryable, not
-- reconstructable from created_at on the target row.
create table if not exists public.agent_tool_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_person_id uuid references public.people(id) on delete set null,
  actor_name text not null default '',
  actor_role text not null default '',
  tool_name text not null,
  args jsonb not null default '{}'::jsonb,
  outcome text not null default '',
  created_at timestamptz not null default now()
);
alter table public.agent_tool_audit enable row level security;
create index if not exists agent_tool_audit_workspace_idx on public.agent_tool_audit (workspace_id, created_at desc);

-- 4. Per-workspace agent kill switch / read-only mode — a fast rollback lever
-- that turns "the agent is misbehaving" from an incident into a toggle.
alter table public.workspaces
  add column if not exists agent_mode text not null default 'full' check (agent_mode in ('full', 'readonly', 'off'));
