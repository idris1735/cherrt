"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitInventoryDetailPage() {
  const params = useParams<{ itemId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const item = snapshot.inventory.find((entry) => entry.id === params.itemId);

  if (!item) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Inventory</p>
          <h2 className="tk-card-title">Item not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          {/* InventoryItem has no status field — badge intentionally omitted */}
        </div>
        <p className="tk-eyebrow">Inventory</p>
        <h2 className="tk-card-title">{item.name}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Location</span>
            <strong>{item.location}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>In stock</span>
            <strong>{item.inStock}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Min level</span>
            <strong>{item.minLevel}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
