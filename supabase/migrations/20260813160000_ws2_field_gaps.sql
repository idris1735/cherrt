-- WS2 — full per-user-type data model: fill the field gaps so every user
-- type's complete field set can be captured and stored (never dropped).
-- Member: occupation + emergency contact. First-timer: how they heard + address.
-- Leader/volunteer: skills + availability. Child who-may-collect is already
-- modelled by guardianships.can_pickup (20260812140000).

alter table public.people
  add column if not exists occupation text,
  add column if not exists emergency_contact text;

alter table public.first_timers
  add column if not exists how_heard text,
  add column if not exists address text;

alter table public.department_memberships
  add column if not exists skills text,
  add column if not exists availability text;

alter table public.child_profiles
  add column if not exists who_may_collect text;
