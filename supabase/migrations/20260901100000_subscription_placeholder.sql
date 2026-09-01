-- Subscription billing placeholder (2026-09-01). The church→Chertt billing side,
-- distinct from organizations.status (the KYC approval lifecycle). Kept separate
-- so KYC and billing never conflate. Defaults to 'active' so every existing
-- church stays connectable — the connect-rail subscription gate only turns
-- someone away for an explicitly canceled/past_due or expired subscription.
--
-- PLACEHOLDER: no real payment is wired yet. activateSubscriptionDemo() flips
-- these; this is the seam where a real Paystack subscription / bank flow slots in.
alter table public.organizations
  add column if not exists subscription_status text not null default 'active'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  add column if not exists subscription_plan text,
  add column if not exists subscription_expires_at timestamptz;
