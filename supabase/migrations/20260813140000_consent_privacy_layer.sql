-- Consent & Privacy Layer, Slice A (2026-08-13).
-- Principle: no person's data without a recorded lawful basis; children always
-- via guardian consent; opt-out is per phone number; consent is versioned.

-- 1. people: versioned consent record
alter table public.people
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists consent_source text;

-- 2. phone_contacts: per-number opt-out
alter table public.phone_contacts
  add column if not exists opted_out boolean not null default false,
  add column if not exists opted_out_at timestamptz;

-- 3. data_requests: data-subject rights (access / deletion / objection)
create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  kind text not null check (kind in ('access', 'deletion', 'objection')),
  status text not null default 'open' check (status in ('open', 'done')),
  note text,
  created_at timestamptz not null default now()
);
alter table public.data_requests enable row level security;
create index if not exists data_requests_status_idx on public.data_requests (status, created_at);
