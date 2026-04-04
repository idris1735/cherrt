"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import type { IssueReport } from "@/lib/types";

const severityOrder = ["high", "medium", "low"] as const;

function issueTheme(issue: IssueReport) {
  if (issue.severity === "high") return { accent: "#c0432a", tint: "#fff0ea", label: "Urgent" };
  if (issue.severity === "medium") return { accent: "#8c6734", tint: "#fcf4e7", label: "Watch" };
  return { accent: "#2f6f82", tint: "#edf7fa", label: "Routine" };
}

export default function ToolkitIssuesPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [selected, setSelected] = useState<IssueReport | null>(null);

  const issues = [...snapshot.issues].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );

  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;
  const openCount = issues.filter((i) => i.status !== "completed").length;
  const nextUrgent = issues.find((i) => i.severity === "high" && i.status !== "completed");

  return (
    <>
      <div className="tk-page">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">Facility and incident reporting</p>
            <h1 className="tk-page-title">Issue queue</h1>
            <p className="tk-page-desc">
              Operational problems, facility faults, and incidents.
              {highCount > 0 ? ` ${highCount} urgent.` : ""}
            </p>
          </div>
          <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
            Report issue
          </Link>
        </div>

        <div className="tk-requests-summary">
          <div className={`tk-requests-summary__item${highCount > 0 ? " tk-requests-summary__item--flagged" : ""}`}>
            <span>High severity</span>
            <strong>{highCount}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Medium</span>
            <strong>{mediumCount}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Low</span>
            <strong>{lowCount}</strong>
          </div>
          <div className="tk-requests-summary__item">
            <span>Still open</span>
            <strong>{openCount}</strong>
          </div>
        </div>

        <div className="tk-layout-2 tk-layout-2--balanced">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Live reports</p>
                <h2 className="tk-card-title">{issues.length} report{issues.length !== 1 ? "s" : ""}</h2>
              </div>
              <div className="tk-requests-toolbar">
                {highCount > 0 ? <span className="tk-badge tk-badge--high">{highCount} urgent</span> : null}
                <span className="tk-badge">{openCount} open</span>
              </div>
            </div>

            <div className="tk-issue-grid">
              {issues.length ? (
                issues.map((issue) => {
                  const theme = issueTheme(issue);
                  return (
                    <button
                      className={`tk-issue-card${issue.severity === "high" ? " tk-issue-card--high" : ""}`}
                      key={issue.id}
                      onClick={() => setSelected(issue)}
                      style={{ "--tk-issue-accent": theme.accent, "--tk-issue-tint": theme.tint } as CSSProperties}
                      type="button"
                    >
                      <div className="tk-issue-card__media">
                        <span className="tk-issue-card__label">{theme.label}</span>
                        <div className="tk-issue-card__media-copy">
                          <span>{issue.area}</span>
                          <strong>{issue.reportedBy}</strong>
                        </div>
                      </div>

                      <div className="tk-issue-card__body">
                        <div className="tk-issue-card__head">
                          <div>
                            <strong>{issue.title}</strong>
                            <p>{issue.mediaCount > 0 ? `${issue.mediaCount} photo${issue.mediaCount !== 1 ? "s" : ""} attached` : "No media yet"}</p>
                          </div>
                          <StatusPill status={issue.status} />
                        </div>

                        <div className="tk-issue-card__stats">
                          <div className="tk-issue-card__stat">
                            <span>Severity</span>
                            <strong>{issue.severity}</strong>
                          </div>
                          <div className="tk-issue-card__stat">
                            <span>Area</span>
                            <strong>{issue.area}</strong>
                          </div>
                          <div className="tk-issue-card__stat">
                            <span>Media</span>
                            <strong>{issue.mediaCount}</strong>
                          </div>
                        </div>

                        <div className="tk-issue-card__footer">
                          <span className="tk-issue-card__hint">Tap for details and next action</span>
                          <span className="tk-inline-link" style={{ minHeight: "auto", padding: "0 10px", fontSize: "0.74rem" }}>View →</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="tk-soft-tile">
                  <strong>No reports yet</strong>
                  <p>Use chat to report a facility problem or incident.</p>
                </div>
              )}
            </div>
          </div>

          <div className="tk-side-stack">
            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Most urgent</p>
                  <h2 className="tk-card-title">Needs attention</h2>
                </div>
              </div>
              {nextUrgent ? (
                <div className="tk-requests-focus">
                  <div className="tk-requests-focus__top">
                    <div>
                      <p className="tk-eyebrow">{nextUrgent.area}</p>
                      <strong>{nextUrgent.title}</strong>
                    </div>
                    <span className="tk-badge tk-badge--high">High</span>
                  </div>
                  <p>Reported by {nextUrgent.reportedBy}{nextUrgent.mediaCount > 0 ? ` · ${nextUrgent.mediaCount} photo${nextUrgent.mediaCount !== 1 ? "s" : ""}` : ""}.</p>
                  <div className="tk-requests-focus__actions">
                    <Link className="button button--ghost" href={`${base}/requests`}>Open workflow</Link>
                    <Link className="tk-inline-link" href={`/w/${snapshot.workspace.slug}/chat`}>Update via chat</Link>
                  </div>
                </div>
              ) : (
                <div className="tk-soft-tile">
                  <strong>No urgent items</strong>
                  <p>All high-severity issues resolved or none open.</p>
                </div>
              )}
            </div>

            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Issue types</p>
                  <h2 className="tk-card-title">What to report</h2>
                </div>
              </div>
              <div className="tk-mini-stack">
                <div className="tk-soft-tile">
                  <strong>Facility faults</strong>
                  <p>Equipment, structural problems, or safety hazards.</p>
                </div>
                <div className="tk-soft-tile">
                  <strong>Security incidents</strong>
                  <p>Access issues, intrusions, or safety events.</p>
                </div>
                <div className="tk-soft-tile">
                  <strong>Maintenance requests</strong>
                  <p>Repairs, replacements, or upkeep work needed.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="tk-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tk-modal__head">
              <div>
                <div className="tk-modal__title">{selected.title}</div>
                <div className="tk-modal__subtitle">{selected.area} — reported by {selected.reportedBy}</div>
              </div>
              <button className="tk-modal__close" onClick={() => setSelected(null)} type="button" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="tk-modal__body">
              <div className="tk-modal__stat-row">
                <div className="tk-modal__stat">
                  <span>Severity</span>
                  <strong style={{ color: issueTheme(selected).accent }}>{selected.severity}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Status</span>
                  <strong><StatusPill status={selected.status} /></strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Photos</span>
                  <strong>{selected.mediaCount}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Area</span>
                  <strong>{selected.area}</strong>
                </div>
                <div className="tk-modal__stat">
                  <span>Reported by</span>
                  <strong>{selected.reportedBy}</strong>
                </div>
              </div>
            </div>
            <div className="tk-modal__actions">
              <Link className="button button--primary" href={`${base}/requests`} onClick={() => setSelected(null)}>Open workflow</Link>
              <Link className="button button--ghost" href={`/w/${snapshot.workspace.slug}/chat`} onClick={() => setSelected(null)}>Update in chat</Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

