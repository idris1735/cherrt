"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";

export default function ToolkitRequestDetailPage() {
  const params = useParams<{ requestId: string; workspaceSlug: string }>();
  const { snapshot, approveRequest } = useAppState();
  const request = snapshot.requests.find((item) => item.id === params.requestId && item.module === "toolkit");

  if (!request) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Request detail</p>
              <h2 className="tk-card-title">Not found</h2>
            </div>
            <Link className="tk-inline-link" href={`/w/${params.workspaceSlug}/modules/toolkit/requests`}>
              Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Request detail</p>
          <h1 className="tk-page-title">{request.title}</h1>
          {request.description ? <p className="tk-page-desc">{request.description}</p> : null}
        </div>
        <StatusPill status={request.status} />
      </div>

      <div className="tk-grid-2">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Summary</p>
              <h2 className="tk-card-title">Details</h2>
            </div>
          </div>

          <div className="tk-detail-grid">
            <div className="tk-detail-cell">
              <span>Type</span>
              <strong>{request.type}</strong>
            </div>
            <div className="tk-detail-cell">
              <span>Requester</span>
              <strong>{request.requester}</strong>
            </div>
            <div className="tk-detail-cell">
              <span>Raised</span>
              <strong>{request.createdAtLabel}</strong>
            </div>
            <div className="tk-detail-cell">
              <span>Amount</span>
              <strong>{request.amount ? formatCurrency(request.amount, snapshot.workspace.currency) : "-"}</strong>
            </div>
          </div>

          {request.status === "pending" ? (
            <div className="tk-card__actions">
              <button className="button button--primary" onClick={() => approveRequest(request.id)} type="button">
                Approve
              </button>
              <Link className="button button--ghost" href={`/w/${params.workspaceSlug}/modules/toolkit/chat`}>
                Continue in chat
              </Link>
            </div>
          ) : null}
        </div>

        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Approval flow</p>
              <h2 className="tk-card-title">Route and sign-off</h2>
            </div>
          </div>

          <div className="tk-steps">
            {request.approvalSteps.map((step) => (
              <div className="tk-step" key={step.id}>
                <span className={`tk-step__dot ${step.completed ? "is-done" : ""}`} />
                <div>
                  <strong>{step.label}</strong>
                  <p>
                    {step.assignee} - {step.dueLabel}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
