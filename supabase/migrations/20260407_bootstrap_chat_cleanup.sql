delete from public.conversations
where title in ('Operations Assistant', 'Business Toolkit Team')
  and not exists (
    select 1
    from public.messages
    where messages.conversation_id = conversations.id
  );

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
  on conflict (workspace_id, user_id) do update
  set email = excluded.email,
      role = excluded.role,
      title = excluded.title;

  return v_workspace_id;
end;
$$;
