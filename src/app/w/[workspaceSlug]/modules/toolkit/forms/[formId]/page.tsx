"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

function buildSampleFields(name: string) {
  const lower = name.toLowerCase();

  if (lower.includes("volunteer")) {
    return ["Full name", "Phone number", "Preferred team", "Availability", "Previous experience"];
  }

  if (lower.includes("guest")) {
    return ["Visitor name", "Visit date", "Rating", "What went well", "What should improve"];
  }

  return ["Name", "Department", "Request detail", "Owner", "Approval note"];
}

function formTheme(submissions: number) {
  if (submissions >= 100) return { accent: "#2f6f82", tint: "#edf7fa", label: "High usage" };
  if (submissions >= 40) return { accent: "#8c6734", tint: "#fcf4e7", label: "Steady usage" };
  return { accent: "#d85e2f", tint: "#fff2ea", label: "Newer flow" };
}

export default function ToolkitFormDetailPage() {
  const params = useParams<{ formId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const form = snapshot.forms.find((entry) => entry.id === params.formId);

  if (!form) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Form detail</p>
              <h2 className="tk-card-title">Form not found</h2>
            </div>
            <Link className="tk-inline-link" href={`${base}/forms`}>
              Back to forms
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const fields = buildSampleFields(form.name);
  const theme = formTheme(form.submissions);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Form detail</p>
          <h1 className="tk-page-title">{form.name}</h1>
          <p className="tk-page-desc">
            Owned by {form.owner}. This form currently has {form.submissions} submission{form.submissions !== 1 ? "s" : ""}.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/forms`}>
          Back to forms
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
          <div className="tk-detail-hero__value">{form.submissions}</div>
        </div>
        <div className="tk-detail-hero__content">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Form setup</p>
              <h2 className="tk-card-title">{form.name}</h2>
            </div>
            <span className="tk-badge">Active</span>
          </div>

          <div className="tk-detail-stat-grid">
            <div className="tk-detail-stat">
              <span>Owner</span>
              <strong>{form.owner}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Submissions</span>
              <strong>{form.submissions}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Fields</span>
              <strong>{fields.length}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Status</span>
              <strong>Active</strong>
            </div>
          </div>

          <p className="tk-detail-hero__note">
            Keep the capture pattern structured so Chertt can turn responses into actionable work without rebuilding the workflow every time.
          </p>

          <div className="tk-card__actions">
            <Link className="button button--primary" href={`/w/${params.workspaceSlug}/chat`}>
              Update in chat
            </Link>
            <Link className="button button--ghost" href={`${base}/feedback`}>
              Use in feedback
            </Link>
          </div>
        </div>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Field structure</p>
              <h2 className="tk-card-title">What this form captures</h2>
            </div>
          </div>
          <div className="tk-steps">
            {fields.map((field, index) => (
              <div className="tk-step" key={field}>
                <span className="tk-step__dot is-done" />
                <div>
                  <strong>Field {index + 1}</strong>
                  <p>{field}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Use case</p>
                <h2 className="tk-card-title">Why this form exists</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <div className="tk-soft-line">Collect structured input without building a new workflow from scratch.</div>
              <div className="tk-soft-line">Keep ownership clear so follow-up work does not disappear.</div>
              <div className="tk-soft-line">Let Chertt turn new needs into updated form structure fast.</div>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Next actions</p>
                <h2 className="tk-card-title">Move this form forward</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${params.workspaceSlug}/chat`}>
                <strong>Add another field</strong>
                <p>Ask Chertt to extend the form when the workflow changes.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/feedback`}>
                <strong>Use it for feedback</strong>
                <p>Convert the structure into a poll, survey, or feedback collection flow.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/forms`}>
                <strong>Back to forms</strong>
                <p>Return to the full forms list and review the other internal forms.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

