-- Organizations (churches) sit above workspaces (branches). A single-location
-- church is just one workspace under one organization — not a special case,
-- the same shape as a multi-branch church with several workspaces.
--
-- New organizations are human-approved, not self-serve (client decision,
-- 2026-07-18 design doc) — created in 'pending_approval' status by the
-- WhatsApp signup flow, flipped to 'active' when a platform admin approves.
--
-- RLS follows the same pattern as whatsapp_sessions: enabled, no
-- anon/authenticated policies. The WhatsApp webhook uses the service-role
-- client (see supabase-server.ts) and bypasses RLS entirely — these tables
-- hold pending business signup data that has no reason to be readable from
-- a browser client.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'active', 'rejected')),
  requested_by_phone text,
  requested_by_name text,
  requested_city text,
  requested_size text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- workspaces.organization_id is nullable: existing pre-migration workspaces
-- (demo/test data) simply have no organization and are not part of the new
-- signup flow. Every workspace created through the new flow will always set
-- this.
alter table public.workspaces
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists workspaces_organization_id_idx on public.workspaces (organization_id);

-- Cross-branch access: an organization admin (typically the senior pastor)
-- can read across every workspace under their organization, distinct from
-- per-workspace membership which stays branch-scoped.
create table if not exists public.organization_admins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_number text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, phone_number)
);

alter table public.organization_admins enable row level security;

create index if not exists organization_admins_phone_idx on public.organization_admins (phone_number);
