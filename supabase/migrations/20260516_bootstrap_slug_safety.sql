-- Replace bootstrap_workspace to avoid silently overwriting another user's workspace on slug collision.
-- Returns the final slug (which may differ from p_slug if a suffix was appended).

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
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_existing_id  uuid;
  v_final_slug   text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_final_slug := p_slug;

  -- Check if the slug already exists
  select w.id into v_existing_id
  from public.workspaces w
  where w.slug = p_slug
  limit 1;

  if v_existing_id is not null then
    if exists (
      select 1 from public.memberships
      where workspace_id = v_existing_id and user_id = auth.uid()
    ) then
      -- Re-setup of user's own workspace — just update it
      update public.workspaces
      set name = p_name, legal_name = p_legal_name, city = p_city, timezone = p_timezone
      where id = v_existing_id;
      v_workspace_id := v_existing_id;
    else
      -- Collision with a different user's workspace — make slug unique
      v_final_slug := p_slug || '-' || substr(md5(auth.uid()::text || now()::text), 1, 5);
    end if;
  end if;

  if v_workspace_id is null then
    insert into public.workspaces (slug, name, legal_name, city, timezone)
    values (v_final_slug, p_name, p_legal_name, p_city, p_timezone)
    returning id into v_workspace_id;
  end if;

  insert into public.memberships (workspace_id, user_id, email, role, title)
  values (v_workspace_id, auth.uid(), p_email, p_role, p_title)
  on conflict (workspace_id, user_id) do update
  set email = excluded.email,
      role  = excluded.role,
      title = excluded.title;

  return v_final_slug;
end;
$$;
