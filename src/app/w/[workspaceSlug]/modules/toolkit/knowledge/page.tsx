"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { Badge, EmptyState, PageHeader, Toolbar } from "@/components/ui";
import uiStyles from "@/components/ui/ui.module.css";
import { demoKnowledgeArticles, type KnowledgeArticle } from "@/lib/data/knowledge";
import {
  createKnowledgeArticle,
  deleteKnowledgeArticle,
  loadWorkspaceKnowledgeArticles,
  parseKnowledgeTags,
  seedDemoKnowledgeArticles,
  updateKnowledgeArticle,
  type KnowledgeInput,
} from "@/lib/services/knowledge-admin";

const TYPE_BADGE_TONE: Record<KnowledgeArticle["type"], "info" | "neutral" | "warning"> = { faq: "info", process: "neutral", policy: "warning" };
const TYPE_LABEL: Record<KnowledgeArticle["type"], string> = { faq: "FAQ", process: "Process", policy: "Policy" };

const emptyDraft: KnowledgeInput = { type: "faq", title: "", body: "", tags: [] };

export default function ToolkitKnowledgePage() {
  const { snapshot } = useAppState();
  const [articles, setArticles] = useState<KnowledgeArticle[]>(demoKnowledgeArticles);
  const [source, setSource] = useState<"loading" | "workspace" | "demo" | "local">("loading");
  const [openId, setOpenId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<KnowledgeArticle["type"] | "all">("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<KnowledgeInput>(emptyDraft);
  const [tagText, setTagText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setSource("loading");
      const remote = await loadWorkspaceKnowledgeArticles(snapshot.workspace.id);
      if (cancelled) return;
      if (remote && remote.length) { setArticles(remote); setSource("workspace"); return; }
      setArticles(demoKnowledgeArticles);
      setSource(remote ? "demo" : "local");
    }
    void load();
    return () => { cancelled = true; };
  }, [snapshot.workspace.id]);

  const filtered = useMemo(() => {
    let rows = typeFilter === "all" ? articles : articles.filter((a) => a.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q) || (a.tags ?? []).some((t) => t.toLowerCase().includes(q)));
    }
    return rows;
  }, [articles, typeFilter, search]);

  const canEditWorkspace = source === "workspace";
  const isFallbackSource = source === "demo" || source === "local";

  function resetEditor() { setDraft(emptyDraft); setTagText(""); setEditingId(null); }

  function startEdit(article: KnowledgeArticle) {
    setEditingId(article.id);
    setDraft({ type: article.type, title: article.title, body: article.body, tags: article.tags });
    setTagText((article.tags ?? []).join(", "));
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    const body = draft.body.trim();
    const tags = parseKnowledgeTags(tagText);
    if (!title || !body) { setNotice("Add a title and body before saving."); return; }
    setSaving(true);
    const input = { ...draft, title, body, tags };
    const saved = editingId ? await updateKnowledgeArticle(editingId, input) : await createKnowledgeArticle(snapshot.workspace.id, input);
    if (!saved) {
      if (source === "local") {
        const localArticle = { id: editingId ?? `local-${Date.now()}`, ...input };
        setArticles((c) => editingId ? c.map((a) => (a.id === editingId ? localArticle : a)) : [localArticle, ...c]);
        setSource("local"); setNotice("Saved locally. Connect Supabase to persist."); resetEditor();
      } else { setNotice("Could not save. Check workspace access."); }
      setSaving(false); return;
    }
    setArticles((c) => editingId ? c.map((a) => (a.id === editingId ? saved : a)) : [saved, ...c]);
    setSource("workspace"); setNotice(editingId ? "Article updated." : "Article added."); resetEditor(); setSaving(false);
  }

  async function handleDelete(article: KnowledgeArticle) {
    if (!confirm(`Delete "${article.title}"?`)) return;
    const removed = await deleteKnowledgeArticle(article.id);
    if (!removed && canEditWorkspace) { setNotice("Could not delete."); return; }
    setArticles((c) => c.filter((a) => a.id !== article.id));
    if (editingId === article.id) resetEditor();
    setNotice("Article deleted.");
  }

  async function handleSeedDemo() {
    setSaving(true);
    const seeded = await seedDemoKnowledgeArticles(snapshot.workspace.id);
    if (!seeded) { setNotice("Could not seed demo articles."); setSaving(false); return; }
    setArticles(seeded); setSource("workspace"); setNotice("Demo articles copied."); setSaving(false);
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <PageHeader
        title="Knowledge"
        meta={`${articles.length} articles`}
        actions={
          canEditWorkspace ? (
            <button className="button button--ghost" onClick={handleSeedDemo} disabled={saving} type="button">Seed demo</button>
          ) : isFallbackSource ? (
            <span style={{ fontSize: "0.75rem", color: "var(--ds-text-muted)" }}>Demo mode</span>
          ) : null
        }
      />

      <Toolbar
        search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search articles..." }}
        filters={
          <div style={{ display: "flex", gap: "4px" }}>
            {(["all", "faq", "process", "policy"] as const).map((t) => (
              <button
                key={t}
                aria-pressed={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                style={{
                  height: "30px", padding: "0 12px", borderRadius: "7px", border: "none", background: typeFilter === t ? "var(--ds-accent)" : "transparent",
                  color: typeFilter === t ? "#fff" : "var(--ds-text-muted)", fontSize: "0.76rem", fontWeight: 500, cursor: "pointer",
                }}
              >
                {t === "all" ? "All" : TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState title="No articles found" hint={search ? "Try a different search" : "Add an article to get started"} />
      ) : (
        <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: "var(--ds-radius)", boxShadow: "var(--ds-shadow)" }}>
          {filtered.map((article, i) => {
            const isOpen = openId === article.id;
            return (
              <div key={article.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--ds-border)" : "none" }}>
                <button
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : article.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", border: "none", background: "transparent",
                    color: "var(--ds-text)", fontSize: "0.84rem", fontWeight: 500, cursor: "pointer", textAlign: "left", letterSpacing: "-0.01em",
                    fontFamily: "inherit",
                  }}
                >
                  <Badge tone={TYPE_BADGE_TONE[article.type]}>{TYPE_LABEL[article.type]}</Badge>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{article.title}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ width: "16px", height: "16px", flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s ease", color: "var(--ds-text-faint)" }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {isOpen && (
                  <div role="region" style={{ padding: "0 16px 14px 52px", fontSize: "0.82rem", lineHeight: 1.65, color: "var(--ds-text-muted)", whiteSpace: "pre-wrap", letterSpacing: "-0.01em" }}>
                    {article.body}
                    {canEditWorkspace && (
                      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        <button className="button button--ghost" onClick={() => startEdit(article)} type="button" style={{ height: "28px", fontSize: "0.72rem" }}>Edit</button>
                        <button className="button button--ghost" onClick={() => handleDelete(article)} type="button" style={{ height: "28px", fontSize: "0.72rem" }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEditWorkspace && (
        <div style={{ background: "var(--ds-surface)", border: "1px solid var(--ds-border)", borderRadius: "var(--ds-radius)", padding: "16px", boxShadow: "var(--ds-shadow)" }}>
          <h3 style={{ fontSize: "0.84rem", fontWeight: 600, marginBottom: "10px", letterSpacing: "-0.01em" }}>{editingId ? "Edit article" : "Add article"}</h3>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as KnowledgeArticle["type"] }))} className={uiStyles["ui-input"]}>
                <option value="faq">FAQ</option>
                <option value="process">Process doc</option>
                <option value="policy">Policy</option>
              </select>
              <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Article title" className={uiStyles["ui-input"]} style={{ flex: 1 }} />
              <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Tags: comma, separated" className={uiStyles["ui-input"]} style={{ width: "180px" }} />
            </div>
            <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder="Article body..." rows={4} className={uiStyles["ui-textarea"]} />
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button className="button button--primary" disabled={saving} type="submit">{saving ? "Saving..." : editingId ? "Update" : "Add article"}</button>
              {editingId && <button className="button button--ghost" onClick={resetEditor} type="button">Cancel</button>}
              {notice && <span style={{ fontSize: "0.75rem", color: "var(--ds-text-muted)" }}>{notice}</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}