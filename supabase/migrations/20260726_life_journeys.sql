-- Life-journey intakes churches run by hand: bereavement support, marriage
-- prep, baptism classes, and new-convert discipleship. One flexible table —
-- the varying per-journey fields live in `details` (jsonb) — since the value
-- here is capturing the intake and surfacing it to a pastor, not rigid schemas.
-- RLS enabled, no policies (service-role webhook). See
-- docs/superpowers/specs/2026-07-21-agentic-engine-design.md

create table if not exists public.life_journeys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  journey_type text not null check (journey_type in ('bereavement', 'marriage_prep', 'baptism', 'discipleship')),
  person_name text not null default '',
  details jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.life_journeys enable row level security;
create index if not exists life_journeys_workspace_idx on public.life_journeys (workspace_id);
create index if not exists life_journeys_type_idx on public.life_journeys (workspace_id, journey_type);
