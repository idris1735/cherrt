-- Durable WhatsApp sessions for webhook state across serverless cold starts.
-- Stores welcome state, guest wallet balance, pending confirmations/approvals,
-- and short conversation history per phone number.

create table if not exists public.whatsapp_sessions (
  phone_number text primary key,
  welcomed boolean not null default false,
  demo_balance integer not null default 500000,
  user_name text,
  pending_confirmation jsonb,
  pending_approval jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_sessions enable row level security;

-- The webhook uses the server service-role client and bypasses RLS.
-- No anon/authenticated policy is added because sessions can contain private
-- operational context and should not be readable from browsers.
