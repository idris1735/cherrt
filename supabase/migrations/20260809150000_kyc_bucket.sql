-- Private bucket for KYC selfies/documents. No public access; read via signed URLs.
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;
