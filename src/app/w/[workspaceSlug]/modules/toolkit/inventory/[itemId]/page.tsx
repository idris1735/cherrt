"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitInventoryDetailPage() {
  const params = useParams<{ itemId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const item = snapshot.inventory.find((entry) => entry.id === params.itemId);
  const { updateInventoryStock } = useAppState();
  const [adjustBy, setAdjustBy] = useState("");

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
        <div className="tk-card__actions" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="ui-input"
            type="number"
            value={adjustBy}
            onChange={(e) => setAdjustBy(e.target.value)}
            placeholder="+/- units"
            style={{ width: "100px" }}
          />
          <button
            className="button button--primary"
            onClick={() => {
              const delta = parseInt(adjustBy, 10);
              if (!isNaN(delta) && delta !== 0) {
                updateInventoryStock(item.id, delta);
                setAdjustBy("");
              }
            }}
            disabled={!adjustBy || isNaN(parseInt(adjustBy, 10)) || parseInt(adjustBy, 10) === 0}
            type="button"
          >
            Adjust stock
          </button>
        </div>
      </div>
    </div>
  );
}
