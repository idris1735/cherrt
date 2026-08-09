-- Defense in depth: OTP challenges hold code hashes. Enable RLS with NO
-- policies so only the service-role key (which bypasses RLS) can read/write —
-- a leaked anon key can never touch this table.
alter table public.otp_challenges enable row level security;
