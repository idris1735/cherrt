-- Approvals with quorum (2026-08-15). Requests that need leader sign-off:
-- department joins, spends, broadcasts. Decisions are recorded per approver;
-- the request resolves only when its quorum is met.
--   quorum 'any'     → first decision decides
--   quorum 'n_of_m'  → required_count approvals decide; too many declines kill it
--   quorum 'all'     → every approver must approve; one decline kills it
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id text not null,             -- the thing being decided (e.g. department_memberships id)
  kind text not null check (kind in ('dept_join', 'spend', 'broadcast')),
  quorum text not null default 'any' check (quorum in ('any', 'all', 'n_of_m')),
  required_count int not null default 1,
  approver_phones text[] not null default '{}',
  decisions jsonb not null default '[]'::jsonb, -- [{by, decision, at}]
  status text not null default 'open' check (status in ('open', 'approved', 'declined')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.approvals enable row level security;
create index if not exists approvals_workspace_status_idx on public.approvals (workspace_id, status);
create index if not exists approvals_request_idx on public.approvals (request_id);
