"use client";

import Link from "next/link";

import { toolkitFaqTopics, toolkitProcessDocuments } from "@/lib/data/toolkit";
import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitKnowledgePage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Operational memory</p>
          <h1 className="tk-page-title">Process knowledge</h1>
          <p className="tk-page-desc">
            Process notes, compliance documents, FAQs, and common answers that Chertt can recall in chat.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/chat`}>
          Ask in chat
        </Link>
      </div>

      <div className="tk-detail-hero">
        <div className="tk-detail-hero__media">
          <span className="tk-detail-hero__badge">Quick recall</span>
          <div className="tk-detail-hero__value">{toolkitProcessDocuments.length + toolkitFaqTopics.length}</div>
        </div>
        <div className="tk-detail-hero__content">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Knowledge surface</p>
              <h2 className="tk-card-title">Ask Chertt anything</h2>
            </div>
            <span className="tk-badge">Searchable in chat</span>
          </div>

          <div className="tk-detail-stat-grid">
            <div className="tk-detail-stat">
              <span>Process docs</span>
              <strong>{toolkitProcessDocuments.length}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>FAQs</span>
              <strong>{toolkitFaqTopics.length}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Module</span>
              <strong>Business Toolkit</strong>
            </div>
          </div>

          <p className="tk-detail-hero__note">
            Process notes, vehicle documents, vendor checklists, and FAQs are all indexed for chat recall. Ask directly and Chertt will pull the right guidance.
          </p>

          <div className="tk-card__actions">
            <Link className="button button--primary" href={`${base}/chat`}>
              Open chat to ask
            </Link>
          </div>
        </div>
      </div>

      <div className="tk-grid-2">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Process documents</p>
              <h2 className="tk-card-title">Pinned for recall</h2>
            </div>
          </div>
          <div className="tk-mini-stack">
            {toolkitProcessDocuments.map((doc) => (
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`} key={doc}>
                <strong>{doc}</strong>
                <p>Saved process note. Ask in chat to retrieve the right steps for this task.</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Common questions</p>
              <h2 className="tk-card-title">Frequently asked</h2>
            </div>
          </div>
          <div className="tk-mini-stack">
            {toolkitFaqTopics.map((topic) => (
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`} key={topic}>
                <strong>{topic}</strong>
                <p>Ask Chertt to pull the relevant answer and next operational step.</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="tk-grid-2">
        <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/documents`}>
          <strong>Smart documents</strong>
          <p>Letters, invoices, and memos drafted and routed through the approval flow.</p>
        </Link>
        <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/onboarding`}>
          <strong>Staff onboarding</strong>
          <p>First-week tasks, orientation appointments, and onboarding checklists.</p>
        </Link>
      </div>
    </div>
  );
}
