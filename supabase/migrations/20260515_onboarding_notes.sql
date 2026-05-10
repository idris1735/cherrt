-- Add notes field to onboarding tracks for per-person commentary.
alter table public.toolkit_onboarding_tracks
  add column if not exists notes text not null default '';
