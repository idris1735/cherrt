"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { FileUpload } from "@/components/shared/file-upload";
import { Badge } from "@/components/ui";

export default function ToolkitIssueDetailPage() {
  const params = useParams<{ issueId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const issue = snapshot.issues.find((i) => i.id === params.issueId);
  const { resolveIssue } = useAppState();
  const [attachments, setAttachments] = useState<string[]>(issue?.attachments ?? []);
  const [resolved, setResolved] = useState(false);

  function handleResolve() {
    if (!issue) return;
    resolveIssue(issue.id);
    setResolved(true);
  }

  if (!issue) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={`${base}/issues`}>← Issues</Link>
          </div>
          <p className="tk-eyebrow">Issue report</p>
          <h2 className="tk-card-title">Issue not found</h2>
        </div>
      </div>
    );
  }

  const severityColor = issue.severity === "high" ? "#c0392b" : issue.severity === "medium" ? "#e67e22" : "#27ae60";

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={`${base}/issues`}>← Issues</Link>
          <span className="tk-status-badge" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <Badge tone={issue.status === "completed" || resolved ? "success" : issue.severity === "high" ? "danger" : "warning"}>{resolved ? "completed" : issue.status}</Badge>
            {(issue.status !== "completed" && !resolved) && (
              <button className="button button--primary" onClick={handleResolve} type="button" style={{ height: "28px", fontSize: "0.72rem" }}>Mark resolved</button>
            )}
          </span>
        </div>
        <p className="tk-eyebrow">Issue report</p>
        <h2 className="tk-card-title">{issue.title}</h2>

        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Severity</span>
            <strong style={{ color: severityColor }}>{issue.severity}</strong>
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

        <FileUpload
          workspaceId={snapshot.workspace.id}
          recordType="issues"
          recordId={issue.id}
          attachments={attachments}
          onAttached={(url) => setAttachments((prev) => [...prev, url])}
          accept="image/*,video/*"
          label="Attach photo"
        />

        <div className="tk-card__actions" style={{ marginTop: 20 }}>
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
