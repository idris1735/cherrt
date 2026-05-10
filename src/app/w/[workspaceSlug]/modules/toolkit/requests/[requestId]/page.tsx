"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";

export default function ToolkitRequestDetailPage() {
  const params = useParams<{ requestId: string; workspaceSlug: string }>();
  const router = useRouter();
  const { snapshot, approveRequest, rejectRequest } = useAppState();
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const base = `/w/${params.workspaceSlug}/modules/toolkit`;
  const request = snapshot.requests.find(
    (r) => r.id === params.requestId && r.module === "toolkit",
  );

  if (!request) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={`${base}/requests`}>← Requests</Link>
          </div>
          <p className="tk-eyebrow">Request</p>
          <h2 className="tk-card-title">Request not found</h2>
        </div>
      </div>
    );
  }

  const canAct = !done && request.status === "pending" &&
    ["owner", "admin", "approver", "finance"].includes(snapshot.membership.role);

  async function handleApprove() {
    setActing("approve");
    approveRequest(request!.id);
    setDone("approved");
    setActing(null);
    setTimeout(() => router.push(`${base}/requests`), 900);
  }

  async function handleReject() {
    setActing("reject");
    rejectRequest(request!.id);
    setDone("rejected");
    setActing(null);
    setTimeout(() => router.push(`${base}/requests`), 900);
  }

  const liveStatus = done === "approved" ? "approved" : done === "rejected" ? "flagged" : request.status;

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={`${base}/requests`}>← Requests</Link>
          <StatusPill status={liveStatus} />
        </div>
        <p className="tk-eyebrow">Approval request</p>
        <h2 className="tk-card-title">{request.title}</h2>

        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>Type</span>
            <strong>{request.type}</strong>
          </div>
          {request.amount != null && (
            <div className="tk-detail-stat">
              <span>Amount</span>
              <strong>{formatCurrency(request.amount, snapshot.workspace.currency)}</strong>
            </div>
          )}
          <div className="tk-detail-stat">
            <span>Requester</span>
            <strong>{request.requester}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Raised</span>
            <strong>{request.createdAtLabel}</strong>
          </div>
        </div>

        {request.description && (
          <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: 4 }}>
            {request.description}
          </p>
        )}

        {request.approvalSteps.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {request.approvalSteps.map((step) => (
              <div
                key={step.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: "0.83rem",
                  color: step.completed ? "var(--success, #267a4f)" : "var(--muted)",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{step.completed ? "✅" : "⏳"}</span>
                <span>
                  <strong>{step.label}</strong> — {step.assignee}
                  <span style={{ marginLeft: 8, opacity: 0.65 }}>{step.dueLabel}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {done && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 10,
              background: done === "approved" ? "var(--success-soft, #eef7f0)" : "#fff0ea",
              color: done === "approved" ? "var(--success, #267a4f)" : "#c0432a",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            {done === "approved" ? "✅ Request approved." : "🚩 Request flagged."}
          </div>
        )}

        {canAct && (
          <div className="tk-card__actions" style={{ gap: 10 }}>
            <button
              className="button button--primary"
              disabled={acting !== null}
              onClick={handleApprove}
            >
              {acting === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              className="button button--ghost"
              disabled={acting !== null}
              onClick={handleReject}
              style={{ color: "#c0432a", borderColor: "#c0432a" }}
            >
              {acting === "reject" ? "Flagging…" : "Reject"}
            </button>
          </div>
        )}

        {!canAct && !done && request.status === "pending" && (
          <div className="tk-card__actions">
            <Link className="button button--primary" href={`/w/${params.workspaceSlug}/chat`}>
              Update in chat →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
