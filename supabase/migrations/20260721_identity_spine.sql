-- Identity & Tenancy Spine — person-centric identity.
-- See docs/superpowers/specs/2026-07-21-identity-tenancy-spine-design.md
--
-- Additive + idempotent backfill. Does NOT drop whatsapp_phone_links: it
-- stays live during cutover so existing code keeps working while call sites
-- migrate to the new resolver. RLS is enabled with no anon/authenticated
-- policies — the WhatsApp webhook uses the service-role client and bypasses
-- RLS, same pattern as organizations/whatsapp_sessions.

-- 1. people — the human, a stable identity independent of any phone number.
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  preferred_name text,
  -- Optional web login. Most people (WhatsApp-only) never have one; this is
  -- how the web/WhatsApp split-brain gets unified when they do.
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.people enable row level security;

-- 2. phone_contacts — contact methods that point AT a person (many → one).
create table if not exists public.phone_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'retired')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.phone_contacts enable row level security;
-- One ACTIVE person per phone (v1). Number-change = retire the old row and
-- insert a new active one pointing at the SAME person_id, so identity
-- survives. Relaxing this one partial index later is the entire "shared
-- phone → several people" unlock.
create unique index if not exists phone_contacts_active_phone_unique
  on public.phone_contacts (phone_number) where status = 'active';
create index if not exists phone_contacts_person_idx on public.phone_contacts (person_id);

-- 3. branch_memberships — a human's role in one branch. Single source of
-- truth for "who belongs to which branch as what" (a fresh table, NOT an
-- evolution of the web-only memberships table, which is reconciled in later).
create table if not exists public.branch_memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null default 'member',
  unit text,
  status text not null default 'active' check (status in ('active', 'left')),
  created_at timestamptz not null default now(),
  unique (person_id, workspace_id)
);
alter table public.branch_memberships enable row level security;
create index if not exists branch_memberships_person_idx on public.branch_memberships (person_id);
create index if not exists branch_memberships_workspace_idx on public.branch_memberships (workspace_id);

-- 4. organization_admins gains a person link (was phone-only).
alter table public.organization_admins
  add column if not exists person_id uuid references public.people(id) on delete cascade;

-- ── Backfill from existing whatsapp_phone_links ────────────────────────────
-- Per-phone loop so each new person correlates cleanly to its phone and its
-- link rows. Idempotent: guarded on an existing active contact, so re-running
-- the migration never duplicates people/contacts/memberships.
do $$
declare
  rec record;
  new_person_id uuid;
begin
  for rec in
    select phone_number, max(user_name) as user_name
    from public.whatsapp_phone_links
    group by phone_number
  loop
    if exists (
      select 1 from public.phone_contacts
      where phone_number = rec.phone_number and status = 'active'
    ) then
      continue;
    end if;

    insert into public.people (full_name)
    values (coalesce(rec.user_name, ''))
    returning id into new_person_id;

    insert into public.phone_contacts (phone_number, person_id, status)
    values (rec.phone_number, new_person_id, 'active');

    -- one membership per link row for this phone; role carried from the
    -- legacy free-text user_role (blank → 'member').
    insert into public.branch_memberships (person_id, workspace_id, role)
    select new_person_id, l.workspace_id,
           coalesce(nullif(trim(l.user_role), ''), 'member')
    from public.whatsapp_phone_links l
    where l.phone_number = rec.phone_number
    on conflict (person_id, workspace_id) do nothing;
  end loop;

  -- resolve organization_admins to their person via the active phone contact
  update public.organization_admins oa
  set person_id = pc.person_id
  from public.phone_contacts pc
  where oa.person_id is null
    and pc.phone_number = oa.phone_number
    and pc.status = 'active';
end $$;
