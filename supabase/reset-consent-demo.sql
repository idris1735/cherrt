-- ============================================================
-- CHERTT — demo reset script (RUN MANUALLY in Supabase SQL editor)
-- Not a migration: lives outside supabase/migrations/ on purpose,
-- so `supabase db push` will NOT apply it automatically.
--
-- What it does:
--   1. Wipes everyone's consent stamp  -> every contact becomes
--      "first contact" again, so the consent gate re-asks before
--      the AI stores anything new.
--   2. Clears chat memory & dedup      -> every phone number gets
--      the clean first-contact experience (no old history).
-- It does NOT delete people, workspaces, or churches.
-- ============================================================

begin;

-- 1. Fresh consent gate for everyone
update public.people
   set consent_at = null,
       consent_version = null,
       consent_source = null;

-- 2. Clear AI chat memory + message dedup + OTP state
delete from public.whatsapp_sessions;
delete from public.whatsapp_processed_messages;
delete from public.otp_challenges;
delete from public.pending_agent_action;

commit;
