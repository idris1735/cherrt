"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitFormDetailPage() {
  const params = useParams<{ formId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const form = snapshot.forms.find((entry) => entry.id === params.formId);

  if (!form) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Form</p>
          <h2 className="tk-card-title">Form not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
        </div>
        <p className="tk-eyebrow">Form</p>
        <h2 className="tk-card-title">{form.name}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Owner</span>
            <strong>{form.owner}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Submissions</span>
            <strong>{form.submissions}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
