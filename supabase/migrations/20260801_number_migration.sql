-- Number migration: when a member changes their WhatsApp number, they file a
-- request from the new number (with their name + old number); a church admin
-- confirms it's them, and their identity re-attaches to the new number. The
-- re-attach itself is trivial thanks to the person-centric spine (retire old
-- phone_contact, add new active one). See src/lib/services/agent/migration-tools.ts
create table if not exists public.number_migration_requests (
  id uuid primary key default gen_random_uuid(),
  new_phone text not null,
  claimed_name text not null default '',
  claimed_old_phone text,
  claimed_church text,
  -- resolved from the old number when possible (precise, secure approval)
  workspace_id uuid references public.workspaces(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.number_migration_requests enable row level security;
create index if not exists number_migration_workspace_idx on public.number_migration_requests (workspace_id, status);
create index if not exists number_migration_newphone_idx on public.number_migration_requests (new_phone);
