-- P1 owner-review fixes (2026-08-16): structured location + church-number
-- mismatch flag on KYC applications.
alter table public.kyc_applications
  add column if not exists city text,
  add column if not exists country text not null default 'Nigeria',
  add column if not exists church_phone_mismatch boolean not null default false;
