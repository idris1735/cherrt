drop policy if exists "workspace members can update conversations" on public.conversations;

create policy "workspace members can update conversations" on public.conversations
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
