"use client";

import Link from "next/link";
import { useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { demoKnowledgeArticles, type KnowledgeArticle } from "@/lib/data/knowledge";

const TYPE_LABELS: Record<KnowledgeArticle["type"], string> = {
  faq: "FAQ",
  process: "Process doc",
  policy: "Policy",
};

const TYPE_ICONS: Record<KnowledgeArticle["type"], string> = {
  faq: "❓",
  process: "📋",
  policy: "📌",
};

export default function ToolkitKnowledgePage() {
  const { snapshot } = useAppState();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<KnowledgeArticle["type"] | "all">("all");

  const articles = demoKnowledgeArticles;
  const filtered = filter === "all" ? articles : articles.filter((a) => a.type === filter);
  const faqs = articles.filter((a) => a.type === "faq").length;
  const procs = articles.filter((a) => a.type === "process").length;
  const policies = articles.filter((a) => a.type === "policy").length;

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Operational memory</p>
          <h1 className="tk-page-title">Knowledge base</h1>
          <p className="tk-page-desc">
            FAQs, process documents, and policies — instantly recalled via chat or WhatsApp.
          </p>
        </div>
        <Link className="tk-inline-link" href={`/w/${snapshot.workspace.slug}/chat`}>
          Ask in chat
        </Link>
      </div>

      <div className="tk-detail-hero">
        <div className="tk-detail-hero__media">
          <span className="tk-detail-hero__badge">Knowledge surface</span>
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
            All articles below are searchable via Chertt chat and WhatsApp. Ask "what's the process for X?" and Chertt will pull the right guidance instantly.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["all", "faq", "process", "policy"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`button ${filter === t ? "button--primary" : "button--ghost"}`}
            style={{ fontSize: "0.8rem", padding: "5px 12px" }}
          >
            {t === "all" ? "All" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Articles */}
      <div className="tk-list">
        {filtered.map((article) => (
          <div key={article.id} className="tk-card" style={{ cursor: "pointer" }} onClick={() => setOpen(open === article.id ? null : article.id)}>
            <div className="tk-card-head">
              <div className="tk-card-head__copy" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "1.1rem" }}>{TYPE_ICONS[article.type]}</span>
                <div>
                  <p className="tk-eyebrow">{TYPE_LABELS[article.type]}</p>
                  <h3 className="tk-card-title" style={{ fontSize: "0.95rem", marginBottom: 0 }}>{article.title}</h3>
                </div>
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{open === article.id ? "▲" : "▼"}</span>
            </div>

            {open === article.id && (
              <p style={{ fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.6, marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                {article.body}
              </p>
            )}

            {article.tags.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {article.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: "0.72rem", background: "var(--accent-soft)", color: "var(--accent)", padding: "2px 8px", borderRadius: 99 }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="tk-card" style={{ background: "var(--accent-soft)" }}>
        <div className="tk-card-head">
          <div className="tk-card-head__copy">
            <p className="tk-eyebrow">Add to knowledge base</p>
            <h3 className="tk-card-title">Add a new FAQ or process doc</h3>
          </div>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Tell Chertt in chat: <em>"Add a FAQ: What is the leave policy? Answer: ..."</em> or <em>"Save a process document for vendor onboarding."</em>
        </p>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
            Add via chat →
          </Link>
        </div>
      </div>
    </div>
  );
}
