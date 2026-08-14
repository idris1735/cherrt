-- WS-A (2026-08-14): persisted chat attachments.
-- Every photo / voice note / document a person sends over WhatsApp is stored
-- in a PRIVATE bucket + this table, so "save this to my record" genuinely
-- saves. RLS deny-all (service-role writes only), mirroring the kyc bucket.

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  kind text not null check (kind in ('image', 'document', 'audio', 'other')),
  storage_path text not null,
  mime_type text,
  caption text,
  source text not null default 'whatsapp',
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.chat_attachments enable row level security;

create index if not exists chat_attachments_person_idx
  on public.chat_attachments (person_id, created_at desc);
create index if not exists chat_attachments_workspace_idx
  on public.chat_attachments (workspace_id, created_at desc);

-- Private bucket — no public access; read via signed URLs only.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;
