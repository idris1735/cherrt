-- Children's classrooms + capacity (Phase 4, 2026-09-04). The church defines its
-- rooms (name + capacity); check-in assigns a child to a room and respects the
-- cap. Foundation for labels / teacher-acceptance / seat-hold later.
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  capacity integer,          -- null = no limit
  age_min integer,
  age_max integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists classrooms_workspace_idx on public.classrooms (workspace_id);
-- RLS deny-all; the app writes through the service-role client (same model as
-- every other tenant table).
alter table public.classrooms enable row level security;

-- Which room a child is checked into (null for churches that haven't set rooms up).
alter table public.child_checkins
  add column if not exists classroom_id uuid references public.classrooms(id) on delete set null;
