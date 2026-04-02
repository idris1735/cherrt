create extension if not exists "pgcrypto";

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text not null,
  city text not null,
  timezone text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  role text not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  mode text not null check (mode in ('ai', 'team')),
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  speaker text not null check (speaker in ('user', 'assistant', 'system')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists workflow_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  module_key text not null,
  request_type text not null,
  title text not null,
  description text not null,
  requester_name text not null,
  amount numeric,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists smart_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  document_type text not null,
  body text not null,
  status text not null,
  prepared_by text not null,
  awaiting_signature_from text,
  amount numeric,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sku text not null,
  name text not null,
  price numeric not null,
  stock integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_name text not null,
  item_count integer not null,
  total numeric not null,
  status text not null,
  fulfillment_code text not null,
  created_at timestamptz not null default now()
);

create table if not exists payment_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  label text not null,
  amount numeric not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists event_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  venue text not null,
  event_date date not null,
  guests_expected integer not null default 0,
  guests_checked_in integer not null default 0
);

alter table workspaces enable row level security;
alter table memberships enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table workflow_requests enable row level security;
alter table smart_documents enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table payment_links enable row level security;
alter table event_records enable row level security;

create policy "workspace members can read their workspace" on workspaces
for select using (
  exists (
    select 1 from memberships
    where memberships.workspace_id = workspaces.id
      and memberships.user_id = auth.uid()
  )
);
