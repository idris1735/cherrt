-- Remaining ChurchBase scenarios: birthdays, volunteer scheduling, lost & found,
-- and office-guest sign-in. FAQ reuses toolkit_knowledge_articles.
-- RLS enabled, no policies (service-role). See src/lib/services/agent/*-tools.ts

-- Birthdays: day + month only (no year — privacy + a simple "today" match).
alter table public.people add column if not exists birth_day integer;
alter table public.people add column if not exists birth_month integer;

create table if not exists public.volunteer_needs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  when_label text,
  slots_needed integer,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.volunteer_needs enable row level security;
create index if not exists volunteer_needs_workspace_idx on public.volunteer_needs (workspace_id, status);

create table if not exists public.volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  need_id uuid not null references public.volunteer_needs(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  name text not null default '',
  created_at timestamptz not null default now(),
  unique (need_id, person_id)
);
alter table public.volunteer_signups enable row level security;
create index if not exists volunteer_signups_need_idx on public.volunteer_signups (need_id);

create table if not exists public.lost_found_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'lost' check (kind in ('lost', 'found')),
  description text not null,
  location text,
  reporter_name text not null default '',
  reporter_person_id uuid references public.people(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);
alter table public.lost_found_items enable row level security;
create index if not exists lost_found_workspace_idx on public.lost_found_items (workspace_id, status);

create table if not exists public.office_guests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  purpose text,
  host text,
  signin_code text not null,
  status text not null default 'in' check (status in ('in', 'out')),
  signed_in_at timestamptz not null default now(),
  signed_out_at timestamptz
);
alter table public.office_guests enable row level security;
create index if not exists office_guests_workspace_idx on public.office_guests (workspace_id, status);
create index if not exists office_guests_code_idx on public.office_guests (workspace_id, signin_code);
