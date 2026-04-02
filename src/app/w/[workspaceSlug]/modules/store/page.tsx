"use client";

import { useAppState } from "@/components/providers/app-state-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusPill } from "@/components/shared/status-pill";
import { SurfaceCard } from "@/components/shared/surface-card";
import { formatCurrency } from "@/lib/format";

export default function StorePage() {
  const { snapshot } = useAppState();

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="StoreFront"
        title="A small catalog with full operational clarity"
        body="Orders, invoicing, receipts, stock view, and payment links are treated as first-class records, not ad hoc messages."
      />

      <div className="three-column-grid">
        <SurfaceCard>
          <SectionHeading eyebrow="Catalog" title="Products" />
          {snapshot.products.map((product) => (
            <div className="record-card" key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <p>{product.sku}</p>
              </div>
              <div className="record-card__meta">
                <strong>{formatCurrency(product.price, snapshot.workspace.currency)}</strong>
                <span>{product.stock} in stock</span>
              </div>
            </div>
          ))}
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading eyebrow="Transactions" title="Orders and invoices" />
          {snapshot.orders.map((order) => (
            <div className="record-card" key={order.id}>
              <div>
                <strong>{order.customer}</strong>
                <p>{order.fulfillmentCode}</p>
              </div>
              <div className="record-card__meta">
                <StatusPill status={order.status} />
                <strong>{formatCurrency(order.total, snapshot.workspace.currency)}</strong>
              </div>
            </div>
          ))}
          {snapshot.invoices.map((invoice) => (
            <div className="record-card" key={invoice.id}>
              <div>
                <strong>{invoice.customer}</strong>
                <p>Invoice</p>
              </div>
              <div className="record-card__meta">
                <strong>{formatCurrency(invoice.amount, snapshot.workspace.currency)}</strong>
                <StatusPill status={invoice.paymentLinkStatus} />
              </div>
            </div>
          ))}
        </SurfaceCard>

        <SurfaceCard tone="accent">
          <SectionHeading eyebrow="Collection" title="Payment links" />
          {snapshot.paymentLinks.map((link) => (
            <div className="record-card" key={link.id}>
              <div>
                <strong>{link.label}</strong>
                <p>Generated via Chertt</p>
              </div>
              <div className="record-card__meta">
                <strong>{formatCurrency(link.amount, snapshot.workspace.currency)}</strong>
                <StatusPill status={link.status} />
              </div>
            </div>
          ))}
        </SurfaceCard>
      </div>
    </div>
  );
}
