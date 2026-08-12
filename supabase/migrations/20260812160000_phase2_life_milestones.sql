-- Phase 2, Slice 6: Life journeys — person milestone timeline.
-- Replaces the unused life_journeys table with a person-centric milestone model.

create table if not exists public.person_milestones (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null
    check (type in ('salvation', 'baptism', 'child_dedication', 'marriage', 'joined_membership', 'bereavement', 'other')),
  occurred_on date,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.person_milestones enable row level security;
create index if not exists milestones_person_idx on public.person_milestones (person_id);
create index if not exists milestones_workspace_idx on public.person_milestones (workspace_id);
