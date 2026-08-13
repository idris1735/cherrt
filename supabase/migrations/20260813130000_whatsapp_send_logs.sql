-- P2-15: WhatsApp send-failure visibility. Best-effort log of every failed
-- outbound send so nothing fails silently during a demo.

create table if not exists public.whatsapp_send_logs (
  id uuid primary key default gen_random_uuid(),
  direction text not null default 'outbound',
  kind text not null default 'text',          -- text | template | interactive | image
  to_phone text,
  status text not null default 'failed',      -- failed | delivered
  error text,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_send_logs enable row level security;
create index if not exists send_logs_created_idx on public.whatsapp_send_logs (created_at desc);
