create table if not exists public.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  purpose text not null check (purpose in ('migrate', 'step_up')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists otp_challenges_phone_purpose_idx on public.otp_challenges (phone_number, purpose);
