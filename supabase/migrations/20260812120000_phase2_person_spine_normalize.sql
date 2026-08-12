-- Phase 2, Slice 0: Person-spine normalization.
-- Add person_id FKs to tables that predate the identity spine.
-- Nullable = zero-downtime; no backfill needed (DB is wiped for demo).

-- first_timers: add person_id (currently stores bare name/phone text)
alter table public.first_timers
  add column if not exists person_id uuid references public.people(id) on delete set null;
create index if not exists first_timers_person_idx on public.first_timers (person_id);

-- department_memberships: add person_id + ministry_unit_id
alter table public.department_memberships
  add column if not exists person_id uuid references public.people(id) on delete set null;
create index if not exists dept_memberships_person_idx on public.department_memberships (person_id);

alter table public.department_memberships
  add column if not exists ministry_unit_id uuid references public.ministry_units(id) on delete set null;
create index if not exists dept_memberships_unit_idx on public.department_memberships (ministry_unit_id);

-- Add assigned_to column to first_timers for follow-up delegation (Slice 3)
alter table public.first_timers
  add column if not exists assigned_to text;
