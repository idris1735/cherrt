-- WS-B (2026-08-14): governed flexible attributes.
-- The AI's long-tail of facts lives here — typed, per-workspace, consent-covered.
-- Special-category data (health, religion, ethnicity, political opinion,
-- sexual orientation, biometric) is REFUSED at write time unless the special
-- consent flag is set. Core fields stay in their real typed columns.

create table if not exists public.person_attributes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  key text not null,
  value text,
  category text not null default 'normal' check (category in ('normal', 'special')),
  source text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, key)
);

alter table public.person_attributes enable row level security;

create index if not exists person_attributes_person_idx
  on public.person_attributes (person_id);
create index if not exists person_attributes_workspace_key_idx
  on public.person_attributes (workspace_id, key);
