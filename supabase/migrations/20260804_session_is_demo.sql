-- Security: mark a WhatsApp session as a genuine Instant-Demo session (set only
-- when provisionDemoChurch succeeds). Role-switching and the demoRole authz
-- override are gated on this flag so a real, production-linked account can never
-- escalate its role via the demo path, even if a stray demo_role value exists.
alter table public.whatsapp_sessions
  add column if not exists is_demo boolean not null default false;
