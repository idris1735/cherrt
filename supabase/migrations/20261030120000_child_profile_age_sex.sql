-- QA CHQ-012 / CHQ-013: capture a child's age and sex at registration, and keep
-- age on the durable profile so check-in can reuse it instead of re-asking.
-- (allergies + medical_notes already live on child_profiles.)
alter table public.child_profiles
  add column if not exists age smallint;

alter table public.child_profiles
  add column if not exists sex text
  check (sex is null or sex in ('male', 'female'));
