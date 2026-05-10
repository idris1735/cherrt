-- Idempotency ledger for Meta WhatsApp webhook deliveries.
-- Meta can retry the same message ID; claiming IDs here prevents duplicate
-- requests, expenses, approvals, or document drafts.

create table if not exists public.whatsapp_processed_messages (
  message_id text primary key,
  from_phone text not null,
  message_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.whatsapp_processed_messages enable row level security;

-- Webhooks use the service-role server client. Browser roles get no access.

