"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitDirectoryPersonPage() {
  const params = useParams<{ personId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const person = snapshot.directory.find((entry) => entry.id === params.personId);

  if (!person) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Contact</p>
          <h2 className="tk-card-title">Person not found</h2>
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
        <p className="tk-eyebrow">Contact</p>
        <h2 className="tk-card-title">{person.name}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Title</span>
            <strong>{person.title}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Unit</span>
            <strong>{person.unit}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Phone</span>
            <strong>{person.phone}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
