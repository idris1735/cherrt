-- WS-D (2026-08-14): child-pickup safety + indexed join codes.

-- 1. Pickup-code brute-force defence: per phone + workspace + kind, 5 wrong
--    attempts inside 10 minutes lock the operation for 15 minutes.
create table if not exists public.pickup_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone_number text not null,
  kind text not null check (kind in ('lookup', 'release')),
  wrong_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.pickup_attempts enable row level security;
create index if not exists pickup_attempts_key_idx
  on public.pickup_attempts (workspace_id, phone_number, kind);

-- 2. Link check-ins to identity so release can bind to a REGISTERED guardian
--    (can_pickup = true), never code-only.
alter table public.child_checkins
  add column if not exists child_person_id uuid references public.people(id) on delete set null,
  add column if not exists guardian_person_id uuid references public.people(id) on delete set null;
create index if not exists child_checkins_person_idx
  on public.child_checkins (child_person_id, guardian_person_id);

-- 3. Indexed join code: stored unique column, derived from the workspace id on
--    insert when absent (backfills exactly the old derived codes, so every
--    live code keeps working).
alter table public.workspaces add column if not exists join_code text unique;
update public.workspaces
   set join_code = upper(substr(replace(id::text, '-', ''), 1, 8))
 where join_code is null;

create or replace function public.set_workspace_join_code()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is null or new.join_code = '' then
    new.join_code := upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_join_code on public.workspaces;
create trigger trg_workspace_join_code
  before insert on public.workspaces
  for each row execute function public.set_workspace_join_code();
