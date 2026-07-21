-- Church announcements broadcast to members. RLS enabled, no policies
-- (service-role webhook). See
-- docs/superpowers/specs/2026-07-21-agentic-engine-design.md
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  body text not null,
  sent_by text not null default '',
  recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
create index if not exists announcements_workspace_idx on public.announcements (workspace_id);
