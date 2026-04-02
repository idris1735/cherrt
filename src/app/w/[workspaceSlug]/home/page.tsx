"use client";

import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { MetricCard } from "@/components/shared/metric-card";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusPill } from "@/components/shared/status-pill";
import { SurfaceCard } from "@/components/shared/surface-card";
import { formatCurrency, pluralize } from "@/lib/format";

export default function WorkspaceHomePage() {
  const { snapshot } = useAppState();
  const pendingApprovals = snapshot.requests.filter((request) => request.status === "pending");
  const liveOrders = snapshot.orders.filter((order) => order.status !== "completed");
  const openIssues = snapshot.issues.filter((issue) => issue.status !== "completed");

  return (
    <div className="page-stack">
      <SurfaceCard className="hero-panel" tone="accent">
        <div>
          <p className="section-heading__eyebrow">Today&apos;s operating pulse</p>
          <h2>The workspace is live, conversational, and fully routed.</h2>
          <p>
            Business Toolkit remains the deepest module, but the shared platform is already carrying approvals, store flows,
            guest access, and pastoral care without changing the core shell.
          </p>
        </div>
        <div className="hero-panel__actions">
          <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
            Start an AI command
          </Link>
          <Link className="button button--ghost" href={`/w/${snapshot.workspace.slug}/modules`}>
            Browse module hubs
          </Link>
        </div>
      </SurfaceCard>

      <div className="metrics-grid">
        <MetricCard label="Pending approvals" value={String(pendingApprovals.length)} note="Awaiting routing or sign-off" />
        <MetricCard label="Live orders" value={String(liveOrders.length)} note="Across StoreFront and linked invoices" />
        <MetricCard label="Open issues" value={String(openIssues.length)} note="Facility and security reports in play" />
        <MetricCard label="Unread updates" value={String(snapshot.notifications.filter((item) => !item.read).length)} note="Signals from all modules" />
      </div>

      <div className="two-column-grid">
        <SurfaceCard>
          <SectionHeading
            eyebrow="Approvals"
            title="Leadership queue"
            body="Every workflow can begin in chat, but it resolves into explicit ownership, steps, and auditability."
          />
          <div className="stack-list">
            {pendingApprovals.map((request) => (
              <div className="list-row" key={request.id}>
                <div>
                  <strong>{request.title}</strong>
                  <p>
                    {request.requester} • {request.createdAtLabel}
                  </p>
                </div>
                <div className="list-row__aside">
                  {request.amount ? <span>{formatCurrency(request.amount, snapshot.workspace.currency)}</span> : null}
                  <StatusPill status={request.status} />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard tone="ink">
          <SectionHeading
            eyebrow="Moments"
            title="What the platform is holding"
            body="The operational memory stays visible even when the user starts from a simple natural-language request."
          />
          <div className="stack-list stack-list--light">
            {snapshot.activities.map((activity) => (
              <div className="timeline-row" key={activity.id}>
                <div className={`timeline-row__dot timeline-row__dot--${activity.module}`} />
                <div>
                  <strong>{activity.title}</strong>
                  <p>{activity.detail}</p>
                </div>
                <span>{activity.timeLabel}</span>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <div className="three-column-grid">
        <SurfaceCard>
          <SectionHeading eyebrow="Smart documents" title="Signature ritual" body="Draft on the move, then route with proper authorization." />
          {snapshot.documents.map((document) => (
            <div className="record-card" key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <p>{document.type}</p>
              </div>
              <div className="record-card__meta">
                <StatusPill status={document.status} />
                <span>{document.awaitingSignatureFrom ?? "Filed"}</span>
              </div>
            </div>
          ))}
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading eyebrow="Operations" title="Inventory and issue memory" body={pluralize(snapshot.inventory.length, "inventory item")} />
          {snapshot.inventory.map((item) => (
            <div className="record-card" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.location}</p>
              </div>
              <div className="record-card__meta">
                <span>{item.inStock} available</span>
                <span>{item.reserved} reserved</span>
              </div>
            </div>
          ))}
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading eyebrow="Calendar" title="Appointments and ceremonies" body="The workspace keeps people, timing, and follow-through in one place." />
          {snapshot.appointments.map((appointment) => (
            <div className="record-card" key={appointment.id}>
              <div>
                <strong>{appointment.title}</strong>
                <p>{appointment.owner}</p>
              </div>
              <span>{appointment.when}</span>
            </div>
          ))}
        </SurfaceCard>
      </div>
    </div>
  );
}
