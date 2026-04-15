"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitIssueDetailPage() {
  const params = useParams<{ issueId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const issue = snapshot.issues.find((entry) => entry.id === params.issueId);

  if (!issue) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Issue report</p>
          <h2 className="tk-card-title">Issue not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{issue.status}</span>
        </div>
        <p className="tk-eyebrow">Issue report</p>
        <h2 className="tk-card-title">{issue.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Severity</span>
            <strong>{issue.severity}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Area</span>
            <strong>{issue.area}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Reported by</span>
            <strong>{issue.reportedBy}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
