create table if not exists public.toolkit_inventory_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  location text not null,
  in_stock integer not null default 0,
  min_level integer not null default 0,
  reserved integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.toolkit_issue_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  area text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null,
  media_count integer not null default 0,
  reported_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.toolkit_expense_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  department text not null,
  amount numeric not null,
  receipt_count integer not null default 0,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.toolkit_forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  submissions integer not null default 0,
  owner text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.toolkit_feedback_polls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  lane text not null check (lane in ('pulse', 'approval', 'guest')),
  audience text not null,
  owner text not null,
  question_count integer not null default 0,
  response_count integer not null default 0,
  target_count integer not null default 0,
  status text not null check (status in ('active', 'closed')),
  updated_at timestamptz not null default now()
);

create table if not exists public.toolkit_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  title text not null,
  unit text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.toolkit_appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  "when" text not null,
  owner text not null,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.payment_links enable row level security;
alter table public.event_records enable row level security;
alter table public.toolkit_inventory_items enable row level security;
alter table public.toolkit_issue_reports enable row level security;
alter table public.toolkit_expense_entries enable row level security;
alter table public.toolkit_forms enable row level security;
alter table public.toolkit_feedback_polls enable row level security;
alter table public.toolkit_people enable row level security;
alter table public.toolkit_appointments enable row level security;

drop policy if exists "workspace members can read products" on public.products;
create policy "workspace members can read products" on public.products
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read orders" on public.orders;
create policy "workspace members can read orders" on public.orders
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read payment links" on public.payment_links;
create policy "workspace members can read payment links" on public.payment_links
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create payment links" on public.payment_links;
create policy "workspace members can create payment links" on public.payment_links
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update payment links" on public.payment_links;
create policy "workspace members can update payment links" on public.payment_links
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read event records" on public.event_records;
create policy "workspace members can read event records" on public.event_records
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read inventory items" on public.toolkit_inventory_items;
create policy "workspace members can read inventory items" on public.toolkit_inventory_items
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create inventory items" on public.toolkit_inventory_items;
create policy "workspace members can create inventory items" on public.toolkit_inventory_items
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update inventory items" on public.toolkit_inventory_items;
create policy "workspace members can update inventory items" on public.toolkit_inventory_items
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read issue reports" on public.toolkit_issue_reports;
create policy "workspace members can read issue reports" on public.toolkit_issue_reports
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create issue reports" on public.toolkit_issue_reports;
create policy "workspace members can create issue reports" on public.toolkit_issue_reports
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update issue reports" on public.toolkit_issue_reports;
create policy "workspace members can update issue reports" on public.toolkit_issue_reports
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read expense entries" on public.toolkit_expense_entries;
create policy "workspace members can read expense entries" on public.toolkit_expense_entries
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create expense entries" on public.toolkit_expense_entries;
create policy "workspace members can create expense entries" on public.toolkit_expense_entries
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update expense entries" on public.toolkit_expense_entries;
create policy "workspace members can update expense entries" on public.toolkit_expense_entries
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read toolkit forms" on public.toolkit_forms;
create policy "workspace members can read toolkit forms" on public.toolkit_forms
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create toolkit forms" on public.toolkit_forms;
create policy "workspace members can create toolkit forms" on public.toolkit_forms
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update toolkit forms" on public.toolkit_forms;
create policy "workspace members can update toolkit forms" on public.toolkit_forms
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read feedback polls" on public.toolkit_feedback_polls;
create policy "workspace members can read feedback polls" on public.toolkit_feedback_polls
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create feedback polls" on public.toolkit_feedback_polls;
create policy "workspace members can create feedback polls" on public.toolkit_feedback_polls
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update feedback polls" on public.toolkit_feedback_polls;
create policy "workspace members can update feedback polls" on public.toolkit_feedback_polls
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read toolkit people" on public.toolkit_people;
create policy "workspace members can read toolkit people" on public.toolkit_people
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create toolkit people" on public.toolkit_people;
create policy "workspace members can create toolkit people" on public.toolkit_people
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update toolkit people" on public.toolkit_people;
create policy "workspace members can update toolkit people" on public.toolkit_people
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read toolkit appointments" on public.toolkit_appointments;
create policy "workspace members can read toolkit appointments" on public.toolkit_appointments
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create toolkit appointments" on public.toolkit_appointments;
create policy "workspace members can create toolkit appointments" on public.toolkit_appointments
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update toolkit appointments" on public.toolkit_appointments;
create policy "workspace members can update toolkit appointments" on public.toolkit_appointments
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
