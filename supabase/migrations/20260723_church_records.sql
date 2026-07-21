-- Church operational records the agent captures over WhatsApp: prayer
-- requests, first-timers, and pastoral-care requests. Giving already has its
-- own table (20260518). RLS enabled with no policies — the service-role
-- webhook bypasses it, same pattern as the other church tables.
-- See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_name text not null default '',
  request text not null,
  is_anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'praying', 'answered', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.prayer_requests enable row level security;
create index if not exists prayer_requests_workspace_idx on public.prayer_requests (workspace_id);

create table if not exists public.first_timers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  phone text,
  invited_by text,
  follow_up_status text not null default 'new' check (follow_up_status in ('new', 'contacted', 'joined', 'inactive')),
  created_at timestamptz not null default now()
);
alter table public.first_timers enable row level security;
create index if not exists first_timers_workspace_idx on public.first_timers (workspace_id);

create table if not exists public.pastoral_care_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_name text not null default '',
  category text not null default 'general',
  details text,
  status text not null default 'open' check (status in ('open', 'scheduled', 'resolved')),
  created_at timestamptz not null default now()
);
alter table public.pastoral_care_requests enable row level security;
create index if not exists pastoral_care_requests_workspace_idx on public.pastoral_care_requests (workspace_id);
