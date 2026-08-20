-- Flow engine (Prompt 1 of 2, 2026-08-20): persist an in-progress
-- deterministic task flow (child check-in, etc.) on the WhatsApp session.
alter table whatsapp_sessions add column if not exists active_flow jsonb;
