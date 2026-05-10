create table if not exists public.toolkit_form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null references public.toolkit_forms(id) on delete cascade,
  submitter_name text not null,
  submitter_contact text,
  responses jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'reviewed', 'closed')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists toolkit_form_submissions_workspace_idx
  on public.toolkit_form_submissions(workspace_id, submitted_at desc);

create index if not exists toolkit_form_submissions_form_idx
  on public.toolkit_form_submissions(form_id, submitted_at desc);

create table if not exists public.toolkit_onboarding_tracks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  person_id uuid references public.toolkit_people(id) on delete set null,
  staff_name text not null,
  role_title text not null default '',
  owner_name text not null default '',
  due_label text not null default '',
  status text not null default 'not-started' check (status in ('not-started', 'in-progress', 'completed')),
  completed_steps text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists toolkit_onboarding_tracks_workspace_idx
  on public.toolkit_onboarding_tracks(workspace_id, updated_at desc);

alter table public.toolkit_form_submissions enable row level security;
alter table public.toolkit_onboarding_tracks enable row level security;

drop policy if exists "workspace members can read form submissions" on public.toolkit_form_submissions;
create policy "workspace members can read form submissions" on public.toolkit_form_submissions
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create form submissions" on public.toolkit_form_submissions;
create policy "workspace members can create form submissions" on public.toolkit_form_submissions
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update form submissions" on public.toolkit_form_submissions;
create policy "workspace members can update form submissions" on public.toolkit_form_submissions
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can delete form submissions" on public.toolkit_form_submissions;
create policy "workspace members can delete form submissions" on public.toolkit_form_submissions
for delete using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read onboarding tracks" on public.toolkit_onboarding_tracks;
create policy "workspace members can read onboarding tracks" on public.toolkit_onboarding_tracks
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create onboarding tracks" on public.toolkit_onboarding_tracks;
create policy "workspace members can create onboarding tracks" on public.toolkit_onboarding_tracks
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update onboarding tracks" on public.toolkit_onboarding_tracks;
create policy "workspace members can update onboarding tracks" on public.toolkit_onboarding_tracks
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can delete onboarding tracks" on public.toolkit_onboarding_tracks;
create policy "workspace members can delete onboarding tracks" on public.toolkit_onboarding_tracks
for delete using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can delete toolkit forms" on public.toolkit_forms;
create policy "workspace members can delete toolkit forms" on public.toolkit_forms
for delete using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can delete toolkit people" on public.toolkit_people;
create policy "workspace members can delete toolkit people" on public.toolkit_people
for delete using (public.is_workspace_member(workspace_id));
