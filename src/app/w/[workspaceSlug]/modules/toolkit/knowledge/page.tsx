"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
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

const TYPE_LABELS: Record<KnowledgeArticle["type"], string> = {
  faq: "FAQ",
  process: "Process doc",
  policy: "Policy",
};

const TYPE_ICONS: Record<KnowledgeArticle["type"], string> = {
  faq: "?",
  process: "P",
  policy: "!",
};

const emptyDraft: KnowledgeInput = {
  type: "faq",
  title: "",
  body: "",
  tags: [],
};

function tagsToString(tags: string[]) {
  return tags.join(", ");
}

export default function ToolkitKnowledgePage() {
  const { snapshot } = useAppState();
  const [articles, setArticles] = useState<KnowledgeArticle[]>(demoKnowledgeArticles);
  const [source, setSource] = useState<"loading" | "workspace" | "demo" | "local">("loading");
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<KnowledgeArticle["type"] | "all">("all");
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

      if (remote && remote.length) {
        setArticles(remote);
        setSource("workspace");
        return;
      }

      setArticles(demoKnowledgeArticles);
      setSource(remote ? "demo" : "local");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [snapshot.workspace.id]);

  const filtered = useMemo(
    () => (filter === "all" ? articles : articles.filter((a) => a.type === filter)),
    [articles, filter],
  );
  const faqs = articles.filter((a) => a.type === "faq").length;
  const procs = articles.filter((a) => a.type === "process").length;
  const policies = articles.filter((a) => a.type === "policy").length;
  const canEditWorkspace = source === "workspace";
  const isFallbackSource = source === "demo" || source === "local";

  function resetEditor() {
    setDraft(emptyDraft);
    setTagText("");
    setEditingId(null);
  }

  function startEdit(article: KnowledgeArticle) {
    setEditingId(article.id);
    setDraft({
      type: article.type,
      title: article.title,
      body: article.body,
      tags: article.tags,
    });
    setTagText(tagsToString(article.tags));
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    const body = draft.body.trim();
    const tags = parseKnowledgeTags(tagText);

    if (!title || !body) {
      setNotice("Add a title and body before saving.");
      return;
    }

    setSaving(true);
    const input = { ...draft, title, body, tags };
    const saved = editingId
      ? await updateKnowledgeArticle(editingId, input)
      : await createKnowledgeArticle(snapshot.workspace.id, input);

    if (!saved) {
      if (source === "local") {
        const localArticle = { id: editingId ?? `local-${Date.now()}`, ...input };
        setArticles((current) =>
          editingId ? current.map((article) => (article.id === editingId ? localArticle : article)) : [localArticle, ...current],
        );
        setSource("local");
        setNotice("Saved locally for this session. Connect Supabase to persist it.");
        resetEditor();
      } else {
        setNotice("Could not save. Check workspace access and Supabase migrations.");
      }
      setSaving(false);
      return;
    }

    setArticles((current) =>
      editingId ? current.map((article) => (article.id === editingId ? saved : article)) : [saved, ...current],
    );
    setSource("workspace");
    setNotice(editingId ? "Article updated." : "Article added to the workspace knowledge base.");
    resetEditor();
    setSaving(false);
  }

  async function handleDelete(article: KnowledgeArticle) {
    if (!confirm(`Delete "${article.title}" from the knowledge base?`)) return;

    const removed = await deleteKnowledgeArticle(article.id);
    if (!removed && canEditWorkspace) {
      setNotice("Could not delete this article. Check workspace access.");
      return;
    }

    setArticles((current) => current.filter((item) => item.id !== article.id));
    if (editingId === article.id) resetEditor();
    setNotice("Article deleted.");
  }

  async function handleSeedDemo() {
    setSaving(true);
    const seeded = await seedDemoKnowledgeArticles(snapshot.workspace.id);
    if (!seeded) {
      setNotice("Could not seed demo articles. This workspace may need Supabase setup first.");
      setSaving(false);
      return;
    }
    setArticles(seeded);
    setSource("workspace");
    setNotice("Demo articles copied into this workspace. You can now edit them.");
    setSaving(false);
  }

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Operational memory</p>
          <h1 className="tk-page-title">Knowledge base</h1>
          <p className="tk-page-desc">
            FAQs, process documents, and policies that Chertt can recall in chat and WhatsApp.
          </p>
        </div>
        <Link className="tk-inline-link" href={`/w/${snapshot.workspace.slug}/chat`}>
          Ask in chat
        </Link>
      </div>

      <div className="tk-detail-hero">
        <div className="tk-detail-hero__media">
          <span className="tk-detail-hero__badge">{source === "workspace" ? "Workspace KB" : "Demo fallback"}</span>
          <div className="tk-detail-hero__value">{articles.length}</div>
        </div>
        <div className="tk-detail-hero__content">
          <div className="tk-detail-stat-grid">
            <div className="tk-detail-stat">
              <span>FAQs</span>
              <strong>{faqs}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Process docs</span>
              <strong>{procs}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Policies</span>
              <strong>{policies}</strong>
            </div>
          </div>
          <p className="tk-detail-hero__note">
            {isFallbackSource
              ? "This workspace is showing the starter demo knowledge. Seed it or add a new article to make WhatsApp answers organization-specific."
              : "These workspace articles are used by Chertt when staff ask policy, process, and FAQ questions."}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["all", "faq", "process", "policy"] as const).map((t) => (
          <button
            className={`button ${filter === t ? "button--primary" : "button--ghost"}`}
            key={t}
            onClick={() => setFilter(t)}
            style={{ fontSize: "0.8rem", padding: "5px 12px" }}
            type="button"
          >
            {t === "all" ? "All" : TYPE_LABELS[t]}
          </button>
        ))}
        {source === "demo" ? (
          <button className="button button--ghost" disabled={saving} onClick={() => void handleSeedDemo()} type="button">
            {saving ? "Seeding..." : "Seed demo into workspace"}
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className="tk-card" style={{ borderColor: "var(--accent)", color: "var(--text)" }}>
          <p style={{ margin: 0, fontSize: "0.88rem" }}>{notice}</p>
        </div>
      ) : null}

      <div className="tk-card">
        <div className="tk-card-head">
          <div className="tk-card-head__copy">
            <p className="tk-eyebrow">{editingId ? "Edit article" : "Add article"}</p>
            <h2 className="tk-card-title">{editingId ? "Update workspace guidance" : "Create knowledge Chertt can recall"}</h2>
          </div>
          {editingId ? (
            <button className="button button--ghost" onClick={resetEditor} type="button">
              Cancel edit
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <div className="field">
            <label htmlFor="kb-type">Type</label>
            <select
              id="kb-type"
              onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as KnowledgeArticle["type"] }))}
              value={draft.type}
            >
              <option value="faq">FAQ</option>
              <option value="process">Process doc</option>
              <option value="policy">Policy</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="kb-title">Title</label>
            <input
              id="kb-title"
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. How do staff request fuel?"
              value={draft.title}
            />
          </div>
          <div className="field">
            <label htmlFor="kb-body">Answer or process</label>
            <textarea
              id="kb-body"
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
              placeholder="Write the guidance exactly as Chertt should recall it."
              rows={5}
              value={draft.body}
            />
          </div>
          <div className="field">
            <label htmlFor="kb-tags">Tags</label>
            <input
              id="kb-tags"
              onChange={(event) => setTagText(event.target.value)}
              placeholder="finance, receipt, approval"
              value={tagText}
            />
          </div>
          <div className="tk-card__actions">
            <button className="button button--primary" disabled={saving} type="submit">
              {saving ? "Saving..." : editingId ? "Save changes" : "Add article"}
            </button>
          </div>
        </form>
      </div>

      <div className="tk-list">
        {filtered.map((article) => {
          const isOpen = open === article.id;
          const editable = canEditWorkspace || source === "local";
          return (
            <article className="tk-card" key={article.id}>
              <button
                onClick={() => setOpen(isOpen ? null : article.id)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                type="button"
              >
                <div className="tk-card-head">
                  <div className="tk-card-head__copy" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        alignItems: "center",
                        background: "var(--accent-soft)",
                        borderRadius: 8,
                        color: "var(--accent)",
                        display: "inline-flex",
                        fontWeight: 800,
                        height: 28,
                        justifyContent: "center",
                        width: 28,
                      }}
                    >
                      {TYPE_ICONS[article.type]}
                    </span>
                    <div>
                      <p className="tk-eyebrow">{TYPE_LABELS[article.type]}</p>
                      <h3 className="tk-card-title" style={{ fontSize: "0.95rem", marginBottom: 0 }}>
                        {article.title}
                      </h3>
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{isOpen ? "Close" : "Open"}</span>
                </div>
              </button>

              {isOpen ? (
                <p style={{ borderTop: "1px solid var(--line)", color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.6, marginTop: 8, paddingTop: 12 }}>
                  {article.body}
                </p>
              ) : null}

              {article.tags.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{ background: "var(--accent-soft)", borderRadius: 99, color: "var(--accent)", fontSize: "0.72rem", padding: "2px 8px" }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {editable ? (
                <div className="tk-card__actions">
                  <button className="button button--ghost" onClick={() => startEdit(article)} type="button">
                    Edit
                  </button>
                  <button className="button button--ghost" onClick={() => void handleDelete(article)} type="button">
                    Delete
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

