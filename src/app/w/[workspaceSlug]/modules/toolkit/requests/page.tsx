"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";
import type { WorkflowRequest } from "@/lib/types";

function requestTheme(request: WorkflowRequest) {
  if (request.status === "flagged") {
    return {
      accent: "#c0432a",
      tint: "#fff0ea",
      label: "Needs escalation",
    };
  }

  if (request.status === "pending") {
    return {
      accent: "#d85e2f",
      tint: "#fff4ee",
      label: "Waiting for action",
    };
  }

  if (request.status === "in-progress") {
    return {
      accent: "#8c6734",
      tint: "#fcf4e7",
      label: "Moving forward",
    };
  }

  return {
    accent: "#267a4f",
    tint: "#eef7f0",
    label: "On track",
  };
}

export default function ToolkitRequestsPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;
  const requests = snapshot.requests
    .filter((request) => request.module === "toolkit")
    .sort((left, right) => {
      const order = ["pending", "flagged", "in-progress", "approved", "completed"];
      return order.indexOf(left.status) - order.indexOf(right.status);
    });

  const pending = requests.filter((request) => request.status === "pending").length;
  const approved = requests.filter((request) => request.status === "approved").length;
  const inProgress = requests.filter((request) => request.status === "in-progress").length;
  const flagged = requests.filter((request) => request.status === "flagged").length;
  const nextApproval = requests.find((request) => request.status === "pending") ?? requests[0];
  const latestRaised = requests[0];
  const latestApproved = requests.find((request) => request.status === "approved");

  return (
    <div className="tk-page tk-requests-page">
      <section className="tk-requests-intro">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">Requests</p>
            <h1 className="tk-page-title">Approvals and operational requests</h1>
            <p className="tk-page-desc">
              Raise work in chat, then follow ownership, amount, and approval pressure from one clean queue.
            </p>
          </div>
          <Link className="button button--primary" href={`${base}/chat`}>
            Raise request
          </Link>
        </div>

        <div className="tk-requests-summary" aria-label="Request status summary">
          <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/requests#queue`}>
            <span>Waiting</span>
            <strong>{pending}</strong>
          </Link>
          <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/requests#queue`}>
            <span>In progress</span>
            <strong>{inProgress}</strong>
          </Link>
          <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/requests#fresh-activity`}>
            <span>Approved</span>
            <strong>{approved}</strong>
          </Link>
          {flagged > 0 ? (
            <Link className="tk-requests-summary__item tk-requests-summary__item--flagged tk-requests-summary__item--link" href={`${base}/requests#waiting-now`}>
              <span>Flagged</span>
              <strong>{flagged}</strong>
            </Link>
          ) : null}
        </div>
      </section>

      <div className="tk-requests-shell">
        <section className="tk-card tk-requests-pane" id="queue">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Queue</p>
              <h2 className="tk-card-title">Open requests</h2>
            </div>
            <div className="tk-requests-toolbar" aria-label="Request summary">
              <span className="tk-badge">{requests.length} total</span>
              <span className="tk-badge">{pending} waiting</span>
              {flagged > 0 ? <span className="tk-badge tk-badge--high">{flagged} flagged</span> : null}
            </div>
          </div>

          <div className="tk-request-grid">
            {requests.length ? (
              requests.map((request) => {
                const theme = requestTheme(request);

                return (
                  <Link
                    className={`tk-request-card${request.status === "flagged" ? " tk-request-card--flagged" : ""}`}
                    href={`${base}/requests/${request.id}`}
                    key={request.id}
                    style={
                      {
                        "--tk-request-accent": theme.accent,
                        "--tk-request-tint": theme.tint,
                      } as CSSProperties
                    }
                  >
                    <div className="tk-request-card__media">
                      <span className="tk-request-card__label">{theme.label}</span>
                      <div className="tk-request-card__media-copy">
                        <span>{request.type}</span>
                        <strong>{request.requester}</strong>
                      </div>
                    </div>

                    <div className="tk-request-card__body">
                      <div className="tk-request-card__head">
                        <div>
                          <strong>{request.title}</strong>
                          <p>{request.description}</p>
                        </div>
                        <StatusPill status={request.status} />
                      </div>

                      <div className="tk-request-card__stats">
                        <div className="tk-request-card__stat">
                          <span>Raised</span>
                          <strong>{request.createdAtLabel}</strong>
                        </div>
                        <div className="tk-request-card__stat">
                          <span>Route</span>
                          <strong>{request.approvalSteps.length} step{request.approvalSteps.length === 1 ? "" : "s"}</strong>
                        </div>
                        <div className="tk-request-card__stat">
                          <span>Amount</span>
                          <strong>{request.amount ? formatCurrency(request.amount, snapshot.workspace.currency) : "No amount"}</strong>
                        </div>
                      </div>

                      <div className="tk-request-card__footer">
                        <span className="tk-request-card__hint">
                          Open this request to review the route, amount, and next approval decision.
                        </span>
                        <span className="tk-inline-link" style={{ minHeight: "auto", padding: 0 }}>
                          Open request →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="tk-soft-tile">
                <strong>No requests yet</strong>
                <p>Raise the first request in chat and Chertt will route it here.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="tk-side-stack tk-requests-side">
          <div className="tk-card" id="waiting-now">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Waiting now</p>
                <h2 className="tk-card-title">Needs a decision</h2>
              </div>
            </div>

            {nextApproval ? (
              <div className="tk-requests-focus">
                <div className="tk-requests-focus__top">
                  <div>
                    <p className="tk-eyebrow">{nextApproval.type}</p>
                    <strong>{nextApproval.title}</strong>
                  </div>
                  <StatusPill status={nextApproval.status} />
                </div>

                <p>{nextApproval.description}</p>

                <div className="tk-requests-focus__meta">
                  <span>{nextApproval.requester}</span>
                  <span>{nextApproval.createdAtLabel}</span>
                  {nextApproval.amount ? <span>{formatCurrency(nextApproval.amount, snapshot.workspace.currency)}</span> : null}
                </div>

                <div className="tk-requests-focus__actions">
                  <Link className="button button--ghost" href={`${base}/requests/${nextApproval.id}`}>
                    Open request
                  </Link>
                  <Link className="tk-inline-link" href={`${base}/chat`}>
                    Raise another
                  </Link>
                </div>
              </div>
            ) : (
              <div className="tk-soft-tile">
                <strong>Nothing waiting</strong>
                <p>The queue is clear right now.</p>
              </div>
            )}
          </div>

          <div className="tk-card" id="fresh-activity">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Fresh activity</p>
                <h2 className="tk-card-title">What moved recently</h2>
              </div>
            </div>

            <div className="tk-mini-stack">
              {latestRaised ? (
                <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/requests/${latestRaised.id}`}>
                  <strong>Latest raised</strong>
                  <p>{latestRaised.title}</p>
                </Link>
              ) : null}

              {latestApproved ? (
                <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/requests/${latestApproved.id}`}>
                  <strong>Recently approved</strong>
                  <p>{latestApproved.title}</p>
                </Link>
              ) : null}

              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`}>
                <strong>Best way to raise work</strong>
                <p>Describe the request in plain language and Chertt will structure it, route it, and keep it visible here.</p>
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
