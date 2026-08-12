-- Phase 2, Slice 2: Children & guardianships.
-- Prerequisite for Phase-4 check-in. A child is a people row with is_minor=true.

-- Mark children on the people table
alter table public.people
  add column if not exists is_minor boolean not null default false;

-- Child-specific profile (allergies, medical, classroom)
create table if not exists public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  allergies text,
  medical_notes text,
  classroom text,
  age_group text,
  created_at timestamptz not null default now()
);
alter table public.child_profiles enable row level security;
create index if not exists child_profiles_person_idx on public.child_profiles (person_id);
create index if not exists child_profiles_workspace_idx on public.child_profiles (workspace_id);

-- Guardianship links: who can pick up / is responsible for a child
create table if not exists public.guardianships (
  id uuid primary key default gen_random_uuid(),
  child_person_id uuid not null references public.people(id) on delete cascade,
  guardian_person_id uuid not null references public.people(id) on delete cascade,
  relationship text not null default 'guardian'
    check (relationship in ('parent', 'guardian', 'relative', 'other')),
  is_primary boolean not null default false,
  can_pickup boolean not null default true,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(child_person_id, guardian_person_id, workspace_id)
);
alter table public.guardianships enable row level security;
create index if not exists guardianships_child_idx on public.guardianships (child_person_id);
create index if not exists guardianships_guardian_idx on public.guardianships (guardian_person_id);
create index if not exists guardianships_workspace_idx on public.guardianships (workspace_id);
