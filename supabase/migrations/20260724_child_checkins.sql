-- Sunday children's check-in. A guardian checks a child in and gets a short
-- pickup code; at pickup a volunteer looks the code up to verify the guardian,
-- and releasing the child is a confirmation-gated action. WhatsApp-native — no
-- camera scanner required. RLS enabled, no policies (service-role webhook).
-- See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

create table if not exists public.child_checkins (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  child_name text not null,
  age integer,
  allergies text,
  guardian_name text not null default '',
  guardian_phone text,
  pickup_code text not null,
  service_label text,
  status text not null default 'checked_in' check (status in ('checked_in', 'picked_up')),
  picked_up_by text,
  checked_in_at timestamptz not null default now(),
  picked_up_at timestamptz
);
alter table public.child_checkins enable row level security;
create index if not exists child_checkins_workspace_idx on public.child_checkins (workspace_id);
create index if not exists child_checkins_code_idx on public.child_checkins (workspace_id, pickup_code);
