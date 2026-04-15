"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { formatCurrency } from "@/lib/format";

export default function ToolkitRequestDetailPage() {
  const params = useParams<{ requestId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const request = snapshot.requests.find((item) => item.id === params.requestId && item.module === "toolkit");

  if (!request) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Request</p>
          <h2 className="tk-card-title">Request not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{request.status}</span>
        </div>
        <p className="tk-eyebrow">Request</p>
        <h2 className="tk-card-title">{request.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Type</span>
            <strong>{request.type}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Amount</span>
            <strong>{request.amount ? formatCurrency(request.amount, snapshot.workspace.currency) : "—"}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Requester</span>
            <strong>{request.requester}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
