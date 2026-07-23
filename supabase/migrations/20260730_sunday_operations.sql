-- Sunday Operations: the weekly service, its summary, member attendance, and
-- department reports that roll up to the pastor. Closes ChurchBase scenarios
-- 1 (service summary), 2 (attendance) and 24 (service reporting).
-- RLS enabled, no policies (service-role webhook). See
-- src/lib/services/agent/sunday-tools.ts

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_date date not null default current_date,
  service_type text not null default 'Sunday Service',
  title text,
  preacher text,
  message_topic text,
  start_time text,               -- free text ("9:00am") — people type loosely
  end_time text,
  attendance_adults integer,
  attendance_children integer,
  first_timers_count integer,
  salvations_count integer,
  offering_total numeric,
  notes text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.services enable row level security;
create index if not exists services_workspace_date_idx on public.services (workspace_id, service_date desc);

-- Department-head submissions for a service (ushering counted 320, children 45…)
create table if not exists public.service_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  department text not null,
  reporter_name text not null default '',
  reporter_person_id uuid references public.people(id) on delete set null,
  headcount integer,
  details text,
  created_at timestamptz not null default now()
);
alter table public.service_reports enable row level security;
create index if not exists service_reports_service_idx on public.service_reports (service_id);
create index if not exists service_reports_workspace_idx on public.service_reports (workspace_id);

-- Per-member attendance (self check-in). One row per member per service.
create table if not exists public.service_attendance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  name text not null default '',
  created_at timestamptz not null default now(),
  unique (service_id, person_id)
);
alter table public.service_attendance enable row level security;
create index if not exists service_attendance_service_idx on public.service_attendance (service_id);
