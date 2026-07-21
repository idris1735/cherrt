-- Stores a consequential agent tool call awaiting the user's YES/NO across
-- WhatsApp messages, so "YES" executes the exact proposed action even after a
-- serverless cold start. Separate from pending_confirmation (the single-shot
-- creator's gate). See docs/superpowers/specs/2026-07-21-agentic-engine-design.md
alter table public.whatsapp_sessions
  add column if not exists pending_agent_action jsonb;
