-- Knowledge articles: FAQs and process documents stored per workspace
create table if not exists public.toolkit_knowledge_articles (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  type         text        not null check (type in ('faq', 'process', 'policy')),
  title        text        not null,
  body         text        not null,
  tags         text[]      not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.toolkit_knowledge_articles enable row level security;

-- anon can read (webhook/WhatsApp needs to load KB without user auth)
drop policy if exists "anon can read knowledge" on public.toolkit_knowledge_articles;
create policy "anon can read knowledge" on public.toolkit_knowledge_articles
  for select using (true);

-- workspace members can insert/update
drop policy if exists "workspace members can manage knowledge" on public.toolkit_knowledge_articles;
create policy "workspace members can manage knowledge" on public.toolkit_knowledge_articles
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
