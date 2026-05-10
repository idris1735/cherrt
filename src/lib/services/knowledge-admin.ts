import { demoKnowledgeArticles, type KnowledgeArticle } from "@/lib/data/knowledge";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

type KnowledgeRow = {
  id: string;
  type: KnowledgeArticle["type"];
  title: string;
  body: string;
  tags: string[] | null;
};

export type KnowledgeInput = {
  type: KnowledgeArticle["type"];
  title: string;
  body: string;
  tags: string[];
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapRow(row: KnowledgeRow): KnowledgeArticle {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    tags: row.tags ?? [],
  };
}

export function parseKnowledgeTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function loadWorkspaceKnowledgeArticles(workspaceId: string): Promise<KnowledgeArticle[] | null> {
  if (!isUuid(workspaceId)) return null;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from("toolkit_knowledge_articles")
    .select("id, type, title, body, tags")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) return null;
  return ((data ?? []) as KnowledgeRow[]).map(mapRow);
}

export async function createKnowledgeArticle(
  workspaceId: string,
  input: KnowledgeInput,
): Promise<KnowledgeArticle | null> {
  if (!isUuid(workspaceId)) return null;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from("toolkit_knowledge_articles")
    .insert({
      workspace_id: workspaceId,
      type: input.type,
      title: input.title,
      body: input.body,
      tags: input.tags,
    })
    .select("id, type, title, body, tags")
    .single();

  if (error || !data) return null;
  return mapRow(data as KnowledgeRow);
}

export async function updateKnowledgeArticle(
  articleId: string,
  input: KnowledgeInput,
): Promise<KnowledgeArticle | null> {
  if (!isUuid(articleId)) return null;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from("toolkit_knowledge_articles")
    .update({
      type: input.type,
      title: input.title,
      body: input.body,
      tags: input.tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId)
    .select("id, type, title, body, tags")
    .single();

  if (error || !data) return null;
  return mapRow(data as KnowledgeRow);
}

export async function deleteKnowledgeArticle(articleId: string): Promise<boolean> {
  if (!isUuid(articleId)) return false;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;

  const { error } = await (supabase as any)
    .from("toolkit_knowledge_articles")
    .delete()
    .eq("id", articleId);

  return !error;
}

export async function seedDemoKnowledgeArticles(workspaceId: string): Promise<KnowledgeArticle[] | null> {
  if (!isUuid(workspaceId)) return null;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const payload = demoKnowledgeArticles.map((article) => ({
    workspace_id: workspaceId,
    type: article.type,
    title: article.title,
    body: article.body,
    tags: article.tags,
  }));

  const { data, error } = await (supabase as any)
    .from("toolkit_knowledge_articles")
    .insert(payload)
    .select("id, type, title, body, tags");

  if (error || !data) return null;
  return (data as KnowledgeRow[]).map(mapRow);
}

