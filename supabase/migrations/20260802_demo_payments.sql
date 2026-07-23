-- Demo giving payments: lets the whole give-now flow work end-to-end with no
-- Paystack key — a member gets a link to a church-branded demo checkout, "pays",
-- and the giving is recorded (channel = 'demo'). Automatically superseded by
-- real Paystack once PAYSTACK_SECRET_KEY is set. See agent/payment-tools.ts.
create table if not exists public.demo_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount numeric not null,
  giving_type text not null default 'offering',
  donor_name text not null default '',
  donor_person_id uuid references public.people(id) on delete set null,
  donor_phone text,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.demo_payments enable row level security;
create index if not exists demo_payments_reference_idx on public.demo_payments (reference);
