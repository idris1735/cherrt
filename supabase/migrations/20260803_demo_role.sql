-- Instant Demo Mode: a tester can switch their effective role to feel other
-- roles' permission walls. Persisted so the override survives between messages.
alter table public.whatsapp_sessions
  add column if not exists demo_role text;
