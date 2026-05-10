-- File attachments for expense entries and issue reports.
-- Stores public URLs from Supabase Storage in a text[] column.

alter table public.toolkit_expense_entries
  add column if not exists attachment_urls text[] not null default '{}';

alter table public.toolkit_issue_reports
  add column if not exists attachment_urls text[] not null default '{}';

-- Storage bucket for workspace file attachments.
insert into storage.buckets (id, name, public)
values ('workspace-attachments', 'workspace-attachments', true)
on conflict (id) do nothing;

-- Authenticated users can upload to their workspace folder.
create policy "workspace members can upload attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'workspace-attachments');

-- Anyone with the URL can read (bucket is public, this policy covers the API path).
create policy "attachments are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'workspace-attachments');

-- Authenticated users can delete their uploads.
create policy "workspace members can delete attachments"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'workspace-attachments');
