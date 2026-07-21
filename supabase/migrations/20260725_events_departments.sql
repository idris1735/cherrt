-- Event registrations and department (ministry unit) join applications — the
-- member-initiated "belong" flows. Events live in event_records already;
-- ministry units in ministry_units. RLS enabled, no policies (service-role).
-- See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid references public.event_records(id) on delete set null,
  event_title text not null,
  attendee_name text not null default '',
  attendee_phone text,
  notes text,
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.event_registrations enable row level security;
create index if not exists event_registrations_workspace_idx on public.event_registrations (workspace_id);

create table if not exists public.department_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unit_name text not null,
  member_name text not null default '',
  member_phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now()
);
alter table public.department_memberships enable row level security;
create index if not exists department_memberships_workspace_idx on public.department_memberships (workspace_id);
