-- Member email verification (2026-08-25): captured on the WhatsApp connect
-- rail, confirmed async & non-blocking via a "verify <code>" reply. The phone
-- is already number-verified (inbound WhatsApp proves control); this stamps the
-- separately-confirmed email. Founder KYC keeps its own column on
-- kyc_applications — this is the member-side equivalent on people.
alter table public.people
  add column if not exists email_verified_at timestamptz;
