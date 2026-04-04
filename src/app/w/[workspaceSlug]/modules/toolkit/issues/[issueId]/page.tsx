"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";

function severityTheme(severity: "low" | "medium" | "high") {
  if (severity === "high") {
    return { accent: "#c0432a", tint: "#fff0ea", label: "Immediate response" };
  }
  if (severity === "medium") {
    return { accent: "#8c6734", tint: "#fcf4e7", label: "Monitor closely" };
  }
  return { accent: "#2f6f82", tint: "#edf7fa", label: "Routine follow-up" };
}

function buildIssueSteps(status: string, reportedBy: string) {
  const resolved = status === "completed";

  return [
    {
      id: "issue-step-1",
      label: "Report captured",
      note: `Initial report logged by ${reportedBy}.`,
      done: true,
    },
    {
      id: "issue-step-2",
      label: "Operations review",
      note: resolved ? "Issue reviewed and assigned." : "Operations team is reviewing priority and ownership.",
      done: status !== "pending",
    },
    {
      id: "issue-step-3",
      label: "Resolution follow-up",
      note: resolved ? "Work closed and ready for confirmation." : "Awaiting final fix and confirmation.",
      done: resolved,
    },
  ];
}

export default function ToolkitIssueDetailPage() {
  const params = useParams<{ issueId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const issue = snapshot.issues.find((entry) => entry.id === params.issueId);

  if (!issue) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Issue detail</p>
              <h2 className="tk-card-title">Issue not found</h2>
            </div>
            <Link className="tk-inline-link" href={`${base}/issues`}>
              Back to issues
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const theme = severityTheme(issue.severity);
  const steps = buildIssueSteps(issue.status, issue.reportedBy);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Issue detail</p>
          <h1 className="tk-page-title">{issue.title}</h1>
          <p className="tk-page-desc">
            Reported in {issue.area}. This issue is currently tracked as {theme.label.toLowerCase()}.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/issues`}>
          Back to issues
        </Link>
      </div>

      <div
        className="tk-detail-hero"
        style={
          {
            "--tk-detail-accent": theme.accent,
            "--tk-detail-tint": theme.tint,
          } as CSSProperties
        }
      >
        <div className="tk-detail-hero__media">
          <span className="tk-detail-hero__badge">{theme.label}</span>
          <div className="tk-detail-hero__value">{issue.area}</div>
        </div>
        <div className="tk-detail-hero__content">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Issue summary</p>
              <h2 className="tk-card-title">{issue.title}</h2>
            </div>
            <StatusPill status={issue.status} />
          </div>

          <div className="tk-detail-stat-grid">
            <div className="tk-detail-stat">
              <span>Severity</span>
              <strong>{issue.severity}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Reported by</span>
              <strong>{issue.reportedBy}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Media</span>
              <strong>{issue.mediaCount}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Area</span>
              <strong>{issue.area}</strong>
            </div>
          </div>

          <p className="tk-detail-hero__note">
            Keep the response trail in one place, attach follow-up evidence, and route any repair decision without losing the original incident context.
          </p>

          <div className="tk-card__actions">
            <Link className="button button--primary" href={`/w/${params.workspaceSlug}/chat`}>
              Update in chat
            </Link>
            <Link className="button button--ghost" href={`${base}/requests`}>
              Open related requests
            </Link>
          </div>
        </div>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Progress</p>
              <h2 className="tk-card-title">How this issue is moving</h2>
            </div>
          </div>
          <div className="tk-steps">
            {steps.map((step) => (
              <div className="tk-step" key={step.id}>
                <span className={`tk-step__dot ${step.done ? "is-done" : ""}`} />
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Response guide</p>
                <h2 className="tk-card-title">What to do next</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <div className="tk-soft-line">Confirm whether this needs a same-day fix.</div>
              <div className="tk-soft-line">Assign an owner and keep chat updates in one thread.</div>
              <div className="tk-soft-line">Capture follow-up media before closing the issue.</div>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Next actions</p>
                <h2 className="tk-card-title">Move this issue forward</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${params.workspaceSlug}/chat`}>
                <strong>Add update</strong>
                <p>Tell Chertt what changed and keep the issue trail current.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/requests`}>
                <strong>Escalate to a request</strong>
                <p>Create or review the repair or replacement workflow linked to this issue.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/issues`}>
                <strong>Back to the queue</strong>
                <p>Return to the full issue list and review the rest of the reports.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

