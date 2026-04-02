"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";

export default function ToolkitDocumentDetailPage() {
  const { snapshot } = useAppState();
  const params = useParams<{ workspaceSlug: string; documentId: string }>();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;
  const document = snapshot.documents.find((item) => item.id === params.documentId);

  if (!document) {
    notFound();
  }

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Smart document</p>
          <h1 className="tk-page-title">{document.title}</h1>
          <p className="tk-page-desc">Review the drafted content, its status, and who needs to action it next.</p>
        </div>
        <Link className="tk-inline-link" href={`${base}/documents`}>
          Back to documents
        </Link>
      </div>

      <div className="tk-detail-grid">
        <div className="tk-detail-cell">
          <span>Type</span>
          <strong>{document.type}</strong>
        </div>
        <div className="tk-detail-cell">
          <span>Status</span>
          <strong>
            <StatusPill status={document.status} />
          </strong>
        </div>
        <div className="tk-detail-cell">
          <span>Prepared by</span>
          <strong>{document.preparedBy}</strong>
        </div>
        <div className="tk-detail-cell">
          <span>Created</span>
          <strong>{document.createdAtLabel}</strong>
        </div>
      </div>

      {document.awaitingSignatureFrom ? (
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Approval routing</p>
              <h2 className="tk-card-title">Next sign-off</h2>
            </div>
          </div>
          <div className="tk-soft-tile">
            <strong>{document.awaitingSignatureFrom}</strong>
            <p>Waiting to sign and release this document.</p>
          </div>
        </div>
      ) : null}

      {document.amount ? (
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Amount</p>
              <h2 className="tk-card-title">{formatCurrency(document.amount, snapshot.workspace.currency)}</h2>
            </div>
          </div>
        </div>
      ) : null}

      <div className="tk-card">
        <div className="tk-card-head">
          <div className="tk-card-head__copy">
            <p className="tk-eyebrow">Document body</p>
            <h2 className="tk-card-title">Draft</h2>
          </div>
        </div>
        <div className="tk-document-body">
          {document.body.split("\n").map((line, index) => (
            <p key={`${line}-${index}`}>{line || "\u00A0"}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
