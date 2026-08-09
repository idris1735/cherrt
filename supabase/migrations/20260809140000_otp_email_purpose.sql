alter table public.otp_challenges drop constraint if exists otp_challenges_purpose_check;
alter table public.otp_challenges add constraint otp_challenges_purpose_check
  check (purpose in ('migrate', 'step_up', 'email'));
