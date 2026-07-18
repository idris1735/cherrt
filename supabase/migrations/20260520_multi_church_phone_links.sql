-- whatsapp_phone_links previously used phone_number as its PRIMARY KEY,
-- meaning a phone number could only ever be linked to one workspace. This
-- breaks the (already-assumed-in-the-original-BRD) case of the same person
-- belonging to more than one church. Restructure to a synthetic id PK with
-- a unique constraint on (phone_number, workspace_id) instead, so a phone
-- number can hold multiple links — one per church/branch it has joined.
--
-- Which workspace a given *conversation* is currently focused on is tracked
-- separately in whatsapp_sessions.active_workspace_id, not on the link rows
-- themselves — the link table just records "this phone belongs to this
-- workspace," the session tracks "this phone is currently talking about
-- that workspace."

-- user_id was NOT NULL, requiring a real Supabase Auth account behind every
-- link. That's a direct conflict with WhatsApp-native member joining (invite
-- code -> automatic member role, no web signup, no auth.users row ever
-- created). Phone number is the identity for these links; user_id becomes
-- optional, populated only if/when someone separately claims web dashboard
-- access with a real account.
alter table public.whatsapp_phone_links alter column user_id drop not null;

alter table public.whatsapp_phone_links drop constraint if exists whatsapp_phone_links_pkey;

alter table public.whatsapp_phone_links
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.whatsapp_phone_links add primary key (id);

alter table public.whatsapp_phone_links
  add constraint whatsapp_phone_links_phone_workspace_unique unique (phone_number, workspace_id);

create index if not exists whatsapp_phone_links_phone_idx on public.whatsapp_phone_links (phone_number);

-- Which workspace an in-progress WhatsApp conversation is currently scoped
-- to, when a phone number is linked to more than one. Null means either
-- "only one link, no ambiguity" or "ambiguous and not yet resolved this
-- conversation" — application code decides which by checking the link count.
alter table public.whatsapp_sessions
  add column if not exists active_workspace_id uuid references public.workspaces(id) on delete set null;

-- In-progress guided flow state (e.g. new church signup intake), separate
-- from pending_confirmation/pending_approval which are for the free-form
-- Gemini artifact path.
alter table public.whatsapp_sessions
  add column if not exists onboarding jsonb;
