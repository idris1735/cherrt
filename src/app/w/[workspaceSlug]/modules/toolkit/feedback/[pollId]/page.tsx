"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitFeedbackDetailPage() {
  const params = useParams<{ pollId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const poll = snapshot.polls.find((entry) => entry.id === params.pollId);

  if (!poll) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Poll</p>
          <h2 className="tk-card-title">Poll not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          <span className="tk-status-badge">{poll.status}</span>
        </div>
        <p className="tk-eyebrow">Poll</p>
        <h2 className="tk-card-title">{poll.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Lane</span>
            <strong>{poll.lane}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Audience</span>
            <strong>{poll.audience}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Responses</span>
            <strong>{poll.responseCount}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
