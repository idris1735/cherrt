-- Teacher-acceptance + seat-hold statuses for children's check-in (Phase 4).
-- Adds who/when a classroom teacher accepted the child, and widens the status:
--   held → checked_in → in_class → picked_up
alter table public.child_checkins
  add column if not exists accepted_by text,
  add column if not exists accepted_at timestamptz;

alter table public.child_checkins drop constraint if exists child_checkins_status_check;
alter table public.child_checkins
  add constraint child_checkins_status_check
  check (status in ('held', 'checked_in', 'in_class', 'picked_up'));
