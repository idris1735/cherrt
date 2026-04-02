"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";
import type { SmartDocument } from "@/lib/types";

type DocFilter = "all" | "letter" | "invoice" | "memo";

const tabs: Array<{ key: DocFilter; label: string }> = [
  { key: "all", label: "All files" },
  { key: "letter", label: "Letters" },
  { key: "invoice", label: "Invoices" },
  { key: "memo", label: "Process docs" },
];

const templateCards: Array<{
  id: string;
  title: string;
  subtitle: string;
  type: Exclude<DocFilter, "all">;
}> = [
  {
    id: "tpl-letter",
    title: "Professional letterhead",
    subtitle: "Formal communication with brand assets",
    type: "letter",
  },
  {
    id: "tpl-invoice",
    title: "Modern invoice",
    subtitle: "Automated calculations and tracking",
    type: "invoice",
  },
  {
    id: "tpl-memo",
    title: "Process memo",
    subtitle: "Internal notes for operations teams",
    type: "memo",
  },
];

function matchesFilter(doc: SmartDocument, filter: DocFilter) {
  return filter === "all" ? true : doc.type === filter;
}

function templateClass(type: Exclude<DocFilter, "all">) {
  if (type === "invoice") return "is-invoice";
  if (type === "memo") return "is-memo";
  return "is-letter";
}

function docMeta(doc: SmartDocument) {
  if (doc.amount) {
    return formatCurrency(doc.amount, "USD");
  }
  if (doc.awaitingSignatureFrom) {
    return `Awaiting ${doc.awaitingSignatureFrom}`;
  }
  return doc.createdAtLabel;
}

export default function ToolkitDocumentsPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DocFilter>("all");

  const docs = snapshot.documents;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return docs.filter((doc) => {
      if (!matchesFilter(doc, filter)) return false;
      if (!needle) return true;
      const haystack = `${doc.title} ${doc.body} ${doc.preparedBy}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [docs, filter, query]);

  const pending = docs.filter((doc) => doc.status === "pending").length;
  const signedOff = docs.filter((doc) => doc.status === "approved").length;
  const needsSignature = docs.filter((doc) => Boolean(doc.awaitingSignatureFrom)).length;

  return (
    <div className="tk-page tk-smartdocs">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Workspace</p>
          <h1 className="tk-page-title">Smart Documents</h1>
          <p className="tk-page-desc">Minimal records view for templates, drafts, approvals, and signatures.</p>
        </div>
        <Link className="button button--primary" href={`${base}/chat`}>
          Draft in chat
        </Link>
      </div>

      <div className="tk-smartdocs__controls">
        <label className="tk-smartdocs__search" htmlFor="smart-doc-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>
          <input
            id="smart-doc-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates or drafts..."
            type="text"
            value={query}
          />
        </label>

        <div className="tk-smartdocs__tabs" role="tablist" aria-label="Document filter">
          {tabs.map((tab) => (
            <button
              aria-selected={filter === tab.key}
              className={`tk-smartdocs__tab ${filter === tab.key ? "is-active" : ""}`}
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tk-smartdocs__summary">
        <div className="tk-smartdocs__pill">
          <span>All files</span>
          <strong>{docs.length}</strong>
        </div>
        <div className={`tk-smartdocs__pill ${pending > 0 ? "is-alert" : ""}`}>
          <span>Pending review</span>
          <strong>{pending}</strong>
        </div>
        <div className="tk-smartdocs__pill">
          <span>Signed off</span>
          <strong>{signedOff}</strong>
        </div>
        <div className={`tk-smartdocs__pill ${needsSignature > 0 ? "is-alert" : ""}`}>
          <span>Awaiting signature</span>
          <strong>{needsSignature}</strong>
        </div>
      </div>

      <section className="tk-card tk-smartdocs__section">
        <div className="tk-smartdocs__section-head">
          <h2>Recommended templates</h2>
          <Link className="tk-inline-link" href={`${base}/chat`}>
            View all
          </Link>
        </div>

        <div className="tk-smartdocs__templates">
          {templateCards.map((template) => (
            <Link className="tk-smartdocs__template" href={`${base}/chat`} key={template.id}>
              <div className={`tk-smartdocs__template-visual ${templateClass(template.type)}`}>
                <span>{template.type === "memo" ? "Process Note" : template.type === "invoice" ? "Tax Ready" : "Letterhead"}</span>
              </div>
              <div className="tk-smartdocs__template-copy">
                <strong>{template.title}</strong>
                <p>{template.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="tk-card tk-smartdocs__section" id="document-list">
        <div className="tk-smartdocs__section-head">
          <h2>Recent drafts</h2>
          <span>{filtered.length} results</span>
        </div>

        {filtered.length ? (
          <div className="tk-smartdocs__rows">
            {filtered.map((doc) => (
              <Link className="tk-smartdocs__row" href={`${base}/documents/${doc.id}`} key={doc.id}>
                <div className={`tk-smartdocs__row-icon ${templateClass(doc.type)}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 4.5h5l3 3V19.5H8A2.5 2.5 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.5Z" />
                    <path d="M13 4.5v4h4M9 12h6M9 15h4" />
                  </svg>
                </div>

                <div className="tk-smartdocs__row-main">
                  <strong>{doc.title}</strong>
                  <p>
                    Edited {doc.createdAtLabel} - {doc.type === "memo" ? "Process docs" : doc.type}
                  </p>
                </div>

                <div className="tk-smartdocs__row-meta">
                  <span>{docMeta(doc)}</span>
                  <StatusPill status={doc.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="tk-soft-tile">
            <strong>No documents match this filter</strong>
            <p>Try another search term or switch the document tab.</p>
          </div>
        )}
      </section>
    </div>
  );
}
