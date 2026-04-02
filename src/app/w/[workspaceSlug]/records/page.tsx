"use client";

import { useMemo, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusPill } from "@/components/shared/status-pill";
import { SurfaceCard } from "@/components/shared/surface-card";
import { formatCurrency } from "@/lib/format";

export default function RecordsPage() {
  const { snapshot } = useAppState();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const combined = [
      ...snapshot.documents.map((item) => ({ id: item.id, title: item.title, meta: item.type, status: item.status })),
      ...snapshot.requests.map((item) => ({ id: item.id, title: item.title, meta: item.type, status: item.status })),
      ...snapshot.events.map((item) => ({ id: item.id, title: item.title, meta: item.venue, status: "completed" as const })),
      ...snapshot.orders.map((item) => ({ id: item.id, title: item.customer, meta: formatCurrency(item.total, snapshot.workspace.currency), status: item.status })),
    ];

    return q ? combined.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(q)) : combined;
  }, [query, snapshot]);

  return (
    <div className="page-stack">
      <SurfaceCard>
        <SectionHeading
          eyebrow="Records and search"
          title="A searchable operational memory"
          body="Documents, approvals, financial items, events, and store transactions are all indexed together."
        />
        <label className="field field--search">
          <span>Search everything</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Try: invoice, diesel, summit, payment link" value={query} />
        </label>
      </SurfaceCard>

      <div className="two-column-grid">
        <SurfaceCard>
          <SectionHeading eyebrow="Search results" title={`${results.length} records`} />
          <div className="stack-list">
            {results.map((item) => (
              <div className="record-card" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.meta}</p>
                </div>
                <StatusPill status={item.status} />
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard tone="accent">
          <SectionHeading eyebrow="Receipts and giving" title="Financial traceability" />
          <div className="stack-list">
            {snapshot.receipts.map((receipt) => (
              <div className="record-card" key={receipt.id}>
                <div>
                  <strong>{receipt.payer}</strong>
                  <p>{receipt.issuedAtLabel}</p>
                </div>
                <strong>{formatCurrency(receipt.amount, snapshot.workspace.currency)}</strong>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
