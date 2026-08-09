create table if not exists public.kyc_applications (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  token_expires_at timestamptz not null,
  applicant_phone text not null,
  church_legal_name text,
  it_number text,
  address text,
  denomination text,
  size text,
  applicant_role text,
  id_type text check (id_type in ('nin', 'bvn')),
  id_last4 text,
  email text,
  email_verified_at timestamptz,
  selfie_path text,
  cac_cert_path text,
  consent_at timestamptz,
  cac_result jsonb,
  id_result jsonb,
  trustee_match text check (trustee_match in ('match', 'no_match', 'unknown')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  reject_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists kyc_applications_status_idx on public.kyc_applications (status);
-- NDPR: service-role only. Enable RLS with no policies (deny all others).
alter table public.kyc_applications enable row level security;
