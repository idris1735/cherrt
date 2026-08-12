-- Phase 2, Slice 5: Pastoral-care forms engine.
-- Seedable form types + submissions table (jsonb data for flexibility).

create table if not exists public.pastoral_forms (
  id uuid primary key default gen_random_uuid(),
  form_type text not null unique
    check (form_type in ('baby_dedication', 'child_naming', 'house_dedication', 'pre_marital', 'training_school')),
  label text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.pastoral_forms enable row level security;

-- Seed the standard form types
insert into public.pastoral_forms (form_type, label, description) values
  ('baby_dedication', 'Baby Dedication', 'Request a baby dedication service'),
  ('child_naming', 'Child Naming', 'Request a child naming ceremony'),
  ('house_dedication', 'House Dedication', 'Request a house dedication'),
  ('pre_marital', 'Pre-Marital Counselling', 'Register for pre-marital counselling'),
  ('training_school', 'Training School', 'Enrol in a church training school or institute')
on conflict (form_type) do nothing;

create table if not exists public.pastoral_form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  form_type text not null references public.pastoral_forms(form_type),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'scheduled', 'completed')),
  assigned_to text,
  created_at timestamptz not null default now()
);
alter table public.pastoral_form_submissions enable row level security;
create index if not exists pfs_workspace_idx on public.pastoral_form_submissions (workspace_id);
create index if not exists pfs_person_idx on public.pastoral_form_submissions (person_id);
create index if not exists pfs_status_idx on public.pastoral_form_submissions (status);
