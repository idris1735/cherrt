"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import type { InventoryItem } from "@/lib/types";

function stockPercent(item: InventoryItem) {
  if (item.minLevel === 0) return 100;
  return Math.min(100, Math.round((item.inStock / (item.minLevel * 2)) * 100));
}

function stockTone(item: InventoryItem) {
  const pct = stockPercent(item);
  if (pct <= 30) return { label: "Needs reorder", color: "#c0432a" };
  if (pct <= 60) return { label: "Watch level", color: "#c08a20" };
  return { label: "Healthy", color: "#267a4f" };
}

function inventoryTheme(item: InventoryItem) {
  const name = item.name.toLowerCase();

  if (name.includes("paper") || name.includes("toner")) {
    return {
      accent: "#d85e2f",
      tint: "#fff1ea",
      glow: "rgba(216, 94, 47, 0.2)",
      type: "Office supply",
    };
  }

  if (name.includes("microphone")) {
    return {
      accent: "#8c6734",
      tint: "#fcf4e7",
      glow: "rgba(140, 103, 52, 0.18)",
      type: "Equipment",
    };
  }

  if (name.includes("tag")) {
    return {
      accent: "#2f6f82",
      tint: "#ebf6fa",
      glow: "rgba(47, 111, 130, 0.18)",
      type: "Front desk",
    };
  }

  return {
    accent: "#705b45",
    tint: "#f4efe9",
    glow: "rgba(112, 91, 69, 0.16)",
    type: "Stock item",
  };
}

function inventoryIcon(item: InventoryItem) {
  const name = item.name.toLowerCase();

  if (name.includes("paper") || name.includes("toner")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4.5h5l3 3V19.5H8A2.5 2.5 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.5Z" />
        <path d="M13 4.5v4h4M9 12h6M9 15h4" />
      </svg>
    );
  }

  if (name.includes("microphone")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4.5a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0V7A2.5 2.5 0 0 1 12 4.5Z" />
        <path d="M7.5 10.5a4.5 4.5 0 0 0 9 0M12 15v4M9.5 19h5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 8.5 12 4l7.5 4.5v7L12 20l-7.5-4.5v-7Z" />
      <path d="M12 11.5 19.5 8M12 11.5 4.5 8M12 11.5V20" />
    </svg>
  );
}

function buildHistory(item: InventoryItem) {
  const available = Math.max(item.inStock - item.reserved, 0);

  return [
    {
      id: `${item.id}-1`,
      label: "Stock count confirmed",
      note: `${item.inStock} units on hand at ${item.location}.`,
    },
    {
      id: `${item.id}-2`,
      label: item.reserved > 0 ? "Reserved for active requests" : "No reservations held",
      note: item.reserved > 0 ? `${item.reserved} units are reserved, leaving ${available} free for release.` : "This item is fully available for release and issue.",
    },
    {
      id: `${item.id}-3`,
      label: item.inStock <= item.minLevel ? "Reorder threshold reached" : "Minimum level still covered",
      note:
        item.inStock <= item.minLevel
          ? `Current stock is at or below the minimum level of ${item.minLevel}.`
          : `Current stock is above the minimum level of ${item.minLevel}.`,
    },
  ];
}

export default function ToolkitInventoryDetailPage() {
  const params = useParams<{ itemId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const item = snapshot.inventory.find((entry) => entry.id === params.itemId);

  if (!item) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Inventory detail</p>
              <h2 className="tk-card-title">Item not found</h2>
            </div>
            <Link className="tk-inline-link" href={`${base}/inventory`}>
              Back to inventory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const available = Math.max(item.inStock - item.reserved, 0);
  const pct = stockPercent(item);
  const tone = stockTone(item);
  const theme = inventoryTheme(item);
  const history = buildHistory(item);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Inventory detail</p>
          <h1 className="tk-page-title">{item.name}</h1>
          <p className="tk-page-desc">
            Review stock health, reserve pressure, reorder position, and the next action for this item.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/inventory`}>
          Back to inventory
        </Link>
      </div>

      <div className="tk-inv-detail">
        <div
          className={`tk-card tk-inv-hero${item.inStock <= item.minLevel ? " tk-inv-hero--low" : ""}`}
          style={
            {
              "--tk-inv-accent": theme.accent,
              "--tk-inv-tint": theme.tint,
              "--tk-inv-glow": theme.glow,
            } as CSSProperties
          }
        >
          <div className="tk-inv-hero__visual">
            <span className="tk-inv-hero__location">{item.location}</span>
            <div className="tk-inv-hero__glyph">{inventoryIcon(item)}</div>
            <div className="tk-inv-hero__type">
              <span>{theme.type}</span>
              <strong>{tone.label}</strong>
            </div>
          </div>

          <div className="tk-inv-hero__content">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Stock health</p>
                <h2 className="tk-card-title">{item.name}</h2>
              </div>
              <span className={`tk-badge ${item.inStock <= item.minLevel ? "tk-badge--high" : "tk-badge--low"}`}>{tone.label}</span>
            </div>

            <div className="tk-inv-bar tk-inv-bar--hero">
              <div className="tk-inv-bar__fill" style={{ width: `${pct}%`, background: tone.color }} />
            </div>

            <div className="tk-inv-card__stats tk-inv-card__stats--hero">
              <div className="tk-inv-card__stat">
                <span>In stock</span>
                <strong>{item.inStock}</strong>
              </div>
              <div className="tk-inv-card__stat">
                <span>Available</span>
                <strong>{available}</strong>
              </div>
              <div className="tk-inv-card__stat">
                <span>Reserved</span>
                <strong>{item.reserved}</strong>
              </div>
              <div className="tk-inv-card__stat">
                <span>Min level</span>
                <strong>{item.minLevel}</strong>
              </div>
            </div>

            <p className="tk-inv-hero__note">
              {item.inStock <= item.minLevel
                ? "This item is now inside reorder territory and should be escalated for replenishment."
                : "This item still has healthy headroom for current operations and approved releases."}
            </p>

            <div className="tk-card__actions">
              <Link className="button button--primary" href={`${base}/chat`}>
                Receive or release in chat
              </Link>
              <Link className="button button--ghost" href={`${base}/requests`}>
                View linked requests
              </Link>
            </div>
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Reorder control</p>
                <h2 className="tk-card-title">Thresholds</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <div className="tk-soft-line">Minimum reorder level: {item.minLevel}</div>
              <div className="tk-soft-line">Free for release now: {available}</div>
              <div className="tk-soft-line">
                {item.inStock <= item.minLevel ? "This item should be restocked now." : "This item is still above its reorder threshold."}
              </div>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Recent movement</p>
                <h2 className="tk-card-title">What happened recently</h2>
              </div>
            </div>
            <div className="tk-steps">
              {history.map((step) => (
                <div className="tk-step" key={step.id}>
                  <span className="tk-step__dot is-done" />
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Next actions</p>
                <h2 className="tk-card-title">Move this item forward</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`}>
                <strong>Receive fresh stock</strong>
                <p>Tell Chertt what arrived and it will update quantities for this item.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`}>
                <strong>Approve release</strong>
                <p>Route stock issue approval and keep a traceable movement record.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`}>
                <strong>Adjust reorder level</strong>
                <p>Set a new threshold if this item now moves faster or slower than expected.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
