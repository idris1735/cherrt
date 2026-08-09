-- Guest: connected to a church but not a full member (may do low-risk
-- self-service). Creation of guest memberships lands in a later slice; this
-- readies the schema so it isn't a blocker.
alter table public.branch_memberships
  drop constraint if exists branch_memberships_status_check;
alter table public.branch_memberships
  add constraint branch_memberships_status_check
  check (status in ('active', 'left', 'guest'));
