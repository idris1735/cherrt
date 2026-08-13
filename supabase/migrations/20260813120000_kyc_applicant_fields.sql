-- Structured applicant/church fields for the hardened onboarding form.
-- Additive + nullable — no impact on existing rows or flow.
alter table public.kyc_applications
  add column if not exists church_phone text,
  add column if not exists applicant_full_name text,
  add column if not exists applicant_position text;
