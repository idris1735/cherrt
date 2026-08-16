-- P2 owner-review extras (2026-08-16):
-- 1) Church @username identifier alongside the join code (WhatsApp is moving
--    to usernames); workspaces keep both.
-- 2) Website field, captured at signup and carried to the workspace.
alter table kyc_applications
  add column if not exists username text,
  add column if not exists website text;

alter table workspaces
  add column if not exists username text,
  add column if not exists website text;

-- Usernames are globally unique identifiers (only set rows participate).
create unique index if not exists workspaces_username_uniq
  on workspaces (username)
  where username is not null;
