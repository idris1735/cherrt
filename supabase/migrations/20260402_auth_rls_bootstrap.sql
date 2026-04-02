create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where memberships.workspace_id = target_workspace
      and memberships.user_id = auth.uid()
  );
$$;

grant execute on function public.is_workspace_member(uuid) to anon, authenticated;

create or replace function public.bootstrap_workspace(
  p_slug text,
  p_name text,
  p_legal_name text,
  p_city text,
  p_timezone text,
  p_email text,
  p_role text default 'owner',
  p_title text default 'Workspace Lead'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.workspaces (slug, name, legal_name, city, timezone)
  values (p_slug, p_name, p_legal_name, p_city, p_timezone)
  on conflict (slug) do update
  set name = excluded.name,
      legal_name = excluded.legal_name,
      city = excluded.city,
      timezone = excluded.timezone
  returning id into v_workspace_id;

  insert into public.memberships (workspace_id, user_id, email, role, title)
  values (v_workspace_id, auth.uid(), p_email, p_role, p_title)
  on conflict do nothing;

  insert into public.conversations (workspace_id, mode, title)
  values
    (v_workspace_id, 'ai', 'Operations Assistant'),
    (v_workspace_id, 'team', 'Business Toolkit Team')
  on conflict do nothing;

  return v_workspace_id;
end;
$$;

grant execute on function public.bootstrap_workspace(text, text, text, text, text, text, text, text) to authenticated;

alter table public.messages drop constraint if exists messages_speaker_check;

alter table public.messages
  add constraint messages_speaker_check
  check (speaker in ('user', 'assistant', 'teammate', 'system'));

drop policy if exists "workspace members can read their workspace" on public.workspaces;

create policy "workspace members can read their workspace" on public.workspaces
for select using (public.is_workspace_member(id));

create policy "workspace members can update their workspace" on public.workspaces
for update using (public.is_workspace_member(id))
with check (public.is_workspace_member(id));

drop policy if exists "members can read memberships in their workspace" on public.memberships;
create policy "members can read memberships in their workspace" on public.memberships
for select using (public.is_workspace_member(workspace_id) or user_id = auth.uid());

drop policy if exists "members can manage their own membership" on public.memberships;
create policy "members can manage their own membership" on public.memberships
for insert with check (user_id = auth.uid());

drop policy if exists "workspace members can read conversations" on public.conversations;
create policy "workspace members can read conversations" on public.conversations
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create conversations" on public.conversations;
create policy "workspace members can create conversations" on public.conversations
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read messages" on public.messages;
create policy "workspace members can read messages" on public.messages
for select using (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and public.is_workspace_member(conversations.workspace_id)
  )
);

drop policy if exists "workspace members can create messages" on public.messages;
create policy "workspace members can create messages" on public.messages
for insert with check (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and public.is_workspace_member(conversations.workspace_id)
  )
);

drop policy if exists "workspace members can read workflow requests" on public.workflow_requests;
create policy "workspace members can read workflow requests" on public.workflow_requests
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create workflow requests" on public.workflow_requests;
create policy "workspace members can create workflow requests" on public.workflow_requests
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update workflow requests" on public.workflow_requests;
create policy "workspace members can update workflow requests" on public.workflow_requests
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can read smart documents" on public.smart_documents;
create policy "workspace members can read smart documents" on public.smart_documents
for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can create smart documents" on public.smart_documents;
create policy "workspace members can create smart documents" on public.smart_documents
for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace members can update smart documents" on public.smart_documents;
create policy "workspace members can update smart documents" on public.smart_documents
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
