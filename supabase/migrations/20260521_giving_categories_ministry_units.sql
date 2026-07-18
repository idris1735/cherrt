-- Admin-named giving categories (e.g. "Building Fund", "Missions") and
-- ministry units (e.g. "Children's Ministry", "Ushering"), collected during
-- the post-approval setup guided flow. Deliberately not wiring these into
-- giving_records.giving_type yet -- that column stays the fixed
-- tithe/offering/donation/pledge enum from the existing Gemini prompt
-- integration; connecting admin-defined categories to that flow is a
-- separate follow-up, not blocking setup collection from happening now.

create table if not exists public.giving_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  target_amount numeric,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

alter table public.giving_categories enable row level security;

create table if not exists public.ministry_units (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

alter table public.ministry_units enable row level security;
