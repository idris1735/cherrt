"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAppState } from "@/components/providers/app-state-provider";
import { formatCurrency } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = {
  pending: "oklch(0.56 0.18 55)",
  approved: "oklch(0.52 0.15 145)",
  draft: "oklch(0.6 0.01 50)",
  "in-progress": "oklch(0.52 0.18 220)",
  completed: "oklch(0.52 0.15 145)",
  flagged: "oklch(0.60 0.20 25)",
};

export default function ToolkitDocumentDetailPage() {
  const { snapshot, upsertDocument, workspaceHydrated } = useAppState();
  const params = useParams<{ workspaceSlug: string; documentId: string }>();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;
  const document = snapshot.documents.find((item) => item.id === params.documentId);

  if (!document) {
    if (!workspaceHydrated) {
      return (
        <div className="tk-page">
          <div className="tk-page-head">
            <div className="tk-page-head__copy">
              <p className="tk-eyebrow">Smart document</p>
              <h1 className="tk-page-title">Loading...</h1>
            </div>
            <Link className="tk-inline-link" href={`${base}/documents`}>
              Back to documents
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="tk-page">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">Smart document</p>
            <h1 className="tk-page-title">Document unavailable</h1>
            <p className="tk-page-desc">This draft could not be found in the current workspace state.</p>
          </div>
          <Link className="tk-inline-link" href={`${base}/documents`}>
            Back to documents
          </Link>
        </div>

        <div className="tk-card">
          <div className="tk-soft-tile">
            <strong>Nothing is open here yet</strong>
            <p>Return to the documents list or reopen the draft from chat.</p>
          </div>
        </div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[document.status] ?? STATUS_COLORS.pending;

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Smart document</p>
          <h1 className="tk-page-title">{document.title}</h1>

          <div className="tk-doc-chips">
            <span className="tk-doc-chip tk-doc-chip--type">{document.type}</span>
            <span
              className="tk-doc-chip"
              style={{
                color: statusColor,
                borderColor: statusColor,
                background: `color-mix(in oklch, ${statusColor} 10%, transparent)`,
              }}
            >
              {document.status}
            </span>
            <span className="tk-doc-chip tk-doc-chip--muted">by {document.preparedBy}</span>
            <span className="tk-doc-chip tk-doc-chip--muted">{document.createdAtLabel}</span>
            {document.amount ? (
              <span className="tk-doc-chip tk-doc-chip--muted">
                {formatCurrency(document.amount, snapshot.workspace.currency)}
              </span>
            ) : null}
          </div>
        </div>
        <Link className="tk-inline-link" href={`${base}/documents`}>
          ← Documents
        </Link>
      </div>

      {document.awaitingSignatureFrom ? (
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Approval routing</p>
              <h2 className="tk-card-title">Waiting for sign-off</h2>
            </div>
          </div>

          <div className="tk-doc-signoff-row">
            <div className="tk-doc-signoff-who">
              <div className="tk-doc-signoff-avatar">{document.awaitingSignatureFrom.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{document.awaitingSignatureFrom}</strong>
                <p>Pending their signature to release this document.</p>
              </div>
            </div>
            {document.status === "pending" ? (
              <div className="tk-card__actions">
                <button
                  className="button button--primary"
                  onClick={() => upsertDocument({ ...document, status: "approved", awaitingSignatureFrom: undefined })}
                  type="button"
                >
                  Sign off now
                </button>
                <Link className="button button--ghost" href={`/w/${params.workspaceSlug}/chat`}>
                  Back to chat
                </Link>
              </div>
            ) : document.status === "approved" ? (
              <span className="tk-approved-label">✓ Signed and approved</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="tk-card tk-doc-body-card">
        <div className="tk-card-head">
          <div className="tk-card-head__copy">
            <p className="tk-eyebrow">{document.type} draft</p>
            <h2 className="tk-card-title">Document body</h2>
          </div>
        </div>
        <div className="tk-document-body tk-document-body--paper">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{document.body}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
