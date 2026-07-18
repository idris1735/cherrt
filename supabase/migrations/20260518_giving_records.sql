create table if not exists public.giving_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  donor_name text not null,
  amount numeric not null,
  channel text not null default 'virtual-transfer',
  service text not null default 'giving',
  church_name text,
  virtual_account text,
  giving_type text not null default 'donation' check (giving_type in ('tithe', 'offering', 'donation', 'pledge')),
  created_at timestamptz not null default now()
);

create index if not exists giving_records_workspace_created_idx
  on public.giving_records (workspace_id, created_at desc);

alter table public.giving_records enable row level security;

drop policy if exists "workspace members can read giving records" on public.giving_records;
create policy "workspace members can read giving records" on public.giving_records
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create giving records" on public.giving_records;
create policy "workspace members can create giving records" on public.giving_records
for insert with check (public.is_workspace_member(workspace_id));
