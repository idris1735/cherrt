-- Per-church personality: an admin can shape how Chertt sounds for their
-- church (style/flavour only — never overrides the safety rules). Layered on
-- top of the base persona at runtime. See src/lib/services/agent/persona.ts.
alter table public.workspaces
  add column if not exists agent_persona text;
