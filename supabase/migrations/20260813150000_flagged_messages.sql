-- WS3 — flagged messages: scam attempts + safeguarding disclosures the AI
-- refused/escalated, surfaced to the platform team. RLS deny-all — service-role
-- only, same pattern as the other sensitive tables.

create table if not exists public.flagged_messages (
  id uuid primary key default gen_random_uuid(),
  from_phone text,
  person_id uuid references public.people(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  kind text not null check (kind in ('scam', 'safeguarding')),
  reason text not null default '',
  excerpt text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.flagged_messages enable row level security;

create index if not exists flagged_messages_status_idx on public.flagged_messages (status);
create index if not exists flagged_messages_workspace_idx on public.flagged_messages (workspace_id);
