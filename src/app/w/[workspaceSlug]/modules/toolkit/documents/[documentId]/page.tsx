"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitDocumentDetailPage() {
  const params = useParams<{ workspaceSlug: string; documentId: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const document = snapshot.documents.find((item) => item.id === params.documentId);

  if (!document) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Smart document</p>
          <h2 className="tk-card-title">Document not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{document.status}</span>
        </div>
        <p className="tk-eyebrow">Smart document</p>
        <h2 className="tk-card-title">{document.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Type</span>
            <strong>{document.type}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Status</span>
            <strong>{document.status}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Prepared by</span>
            <strong>{document.preparedBy}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
