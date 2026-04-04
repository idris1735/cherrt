"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";

const laneCopy = {
  pulse: {
    title: "Staff pulse",
    desc: "Quick internal check-ins for teams and leadership to track operational rhythm.",
  },
  approval: {
    title: "Approval review",
    desc: "Collect sign-off feedback on drafts, scripts, graphics, and internal decisions.",
  },
  guest: {
    title: "Guest feedback",
    desc: "Capture visitor, service, and reception experience in a structured way.",
  },
} as const;

export default function ToolkitFeedbackPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const polls = snapshot.polls;
  const activePolls = polls.filter((poll) => poll.status === "active");
  const closedPolls = polls.filter((poll) => poll.status === "closed");
  const totalResponses = polls.reduce((sum, poll) => sum + poll.responseCount, 0);
  const totalTarget = polls.reduce((sum, poll) => sum + poll.targetCount, 0);
  const overallCompletion = totalTarget > 0 ? Math.round((totalResponses / totalTarget) * 100) : 0;
  const approvalPolls = polls.filter((poll) => poll.lane === "approval").length;

  const laneStats = (["pulse", "approval", "guest"] as const).map((lane) => {
    const lanePolls = polls.filter((poll) => poll.lane === lane);
    const responses = lanePolls.reduce((sum, poll) => sum + poll.responseCount, 0);
    const target = lanePolls.reduce((sum, poll) => sum + poll.targetCount, 0);
    const completion = target > 0 ? Math.round((responses / target) * 100) : 0;

    return {
      lane,
      polls: lanePolls.length,
      responses,
      target,
      completion,
    };
  });

  const strongestLane = [...laneStats]
    .filter((lane) => lane.polls > 0)
    .sort((left, right) => right.completion - left.completion)[0];

  const laneLeads = {
    pulse: polls.find((poll) => poll.lane === "pulse"),
    approval: polls.find((poll) => poll.lane === "approval"),
    guest: polls.find((poll) => poll.lane === "guest"),
  };

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Polls, surveys, and feedback</p>
          <h1 className="tk-page-title">Collect structured input</h1>
          <p className="tk-page-desc">
            Pulse checks, approval reviews, and guest feedback that Chertt can track, summarize, and follow up on.
          </p>
        </div>
        <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
          Create in chat
        </Link>
      </div>

      <div className="tk-requests-summary">
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/feedback#active-polls`}>
          <span>Active polls</span>
          <strong>{activePolls.length}</strong>
        </Link>
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/feedback#response-summary`}>
          <span>Total responses</span>
          <strong>{totalResponses}</strong>
        </Link>
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/feedback#lane-grid`}>
          <span>Approval reviews</span>
          <strong>{approvalPolls}</strong>
        </Link>
        <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/feedback#closed-polls`}>
          <span>Closed polls</span>
          <strong>{closedPolls.length}</strong>
        </Link>
      </div>

      <div className="tk-feedback-analytics" id="response-summary">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Response health</p>
              <h2 className="tk-card-title">Lane completion chart</h2>
            </div>
          </div>
          <div className="tk-feedback-bars">
            {laneStats.map((lane) => (
              <div className="tk-feedback-bar" key={lane.lane}>
                <div className="tk-feedback-bar__top">
                  <strong>{laneCopy[lane.lane].title}</strong>
                  <span>
                    {lane.responses}/{lane.target || 0} ({lane.completion}%)
                  </span>
                </div>
                <div className="tk-feedback-meter">
                  <div className="tk-feedback-meter__fill" style={{ width: `${Math.max(6, lane.completion)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Coverage</p>
              <h2 className="tk-card-title">Overall participation</h2>
            </div>
          </div>
          <div className="tk-feedback-overview">
            <div className="tk-feedback-ring" style={{ "--tk-ring-value": `${overallCompletion}%` } as CSSProperties}>
              <strong>{overallCompletion}%</strong>
              <span>complete</span>
            </div>
            <div className="tk-detail-grid">
              <div className="tk-detail-cell">
                <span>Polls</span>
                <strong>{polls.length}</strong>
              </div>
              <div className="tk-detail-cell">
                <span>Responses</span>
                <strong>{totalResponses}</strong>
              </div>
              <div className="tk-detail-cell">
                <span>Audience reach</span>
                <strong>{totalTarget}</strong>
              </div>
              <div className="tk-detail-cell">
                <span>Approval reviews</span>
                <strong>{approvalPolls}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tk-feedback-lanes" id="lane-grid">
        {(["pulse", "approval", "guest"] as const).map((lane) => (
          <Link
            className="tk-card tk-card--clickable tk-feedback-lane"
            href={laneLeads[lane] ? `${base}/feedback/${laneLeads[lane]!.id}` : `/w/${snapshot.workspace.slug}/chat`}
            key={lane}
          >
            <p className="tk-eyebrow">Feedback lane</p>
            <h2 className="tk-card-title">{laneCopy[lane].title}</h2>
            <p className="tk-page-desc">{laneCopy[lane].desc}</p>
            <span className="tk-inline-link tk-feedback-lane__link" style={{ marginTop: "6px" }}>
              {laneLeads[lane] ? "Open lane ->" : "Create in chat ->"}
            </span>
          </Link>
        ))}
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-stack-lg">
          <div className="tk-card" id="active-polls">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Active polls</p>
                <h2 className="tk-card-title">{activePolls.length} running now</h2>
              </div>
            </div>
            {activePolls.length ? (
              <div className="tk-list">
                {activePolls.map((poll) => (
                  <Link className="tk-row tk-row--link" href={`${base}/feedback/${poll.id}`} key={poll.id}>
                    <div className="tk-row__main">
                      <strong>{poll.title}</strong>
                      <p>
                        {poll.audience} - {poll.questionCount} questions - {poll.updatedAtLabel}
                      </p>
                    </div>
                    <div className="tk-row__aside">
                      <span className="tk-badge">
                        {poll.responseCount}/{poll.targetCount}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="tk-soft-tile">
                <strong>No active polls</strong>
                <p>Ask Chertt to create a pulse check, approval review, or guest survey.</p>
              </div>
            )}
          </div>

          <div className="tk-card" id="closed-polls">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Closed polls</p>
                <h2 className="tk-card-title">Finished feedback cycles</h2>
              </div>
            </div>
            {closedPolls.length ? (
              <div className="tk-list">
                {closedPolls.map((poll) => (
                  <Link className="tk-row tk-row--link" href={`${base}/feedback/${poll.id}`} key={poll.id}>
                    <div className="tk-row__main">
                      <strong>{poll.title}</strong>
                      <p>{poll.audience} - {poll.responseCount} responses captured</p>
                    </div>
                    <div className="tk-row__aside">
                      <span className="tk-badge">Closed</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="tk-soft-tile">
                <strong>No closed polls yet</strong>
                <p>Completed surveys will stay here for review and reuse.</p>
              </div>
            )}
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Signal right now</p>
                <h2 className="tk-card-title">Best performing lane</h2>
              </div>
            </div>
            {strongestLane ? (
              <div className="tk-mini-stack">
                <div className="tk-soft-tile">
                  <strong>{laneCopy[strongestLane.lane].title}</strong>
                  <p>
                    {strongestLane.completion}% completion from {strongestLane.responses}/{strongestLane.target || 0}
                    {" "}responses.
                  </p>
                </div>
              </div>
            ) : (
              <div className="tk-soft-tile">
                <strong>No lane data yet</strong>
                <p>Create the first poll and this panel will highlight completion performance.</p>
              </div>
            )}
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">How it works</p>
                <h2 className="tk-card-title">Create feedback in chat</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <div className="tk-soft-tile">
                <strong>Describe what you want to measure</strong>
                <p>Tell Chertt the audience, question count, and what decision the poll should support.</p>
              </div>
              <Link className="button button--ghost" href={`/w/${snapshot.workspace.slug}/chat`}>
                Start in chat
              </Link>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Connected forms</p>
                <h2 className="tk-card-title">Form-backed feedback</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              {snapshot.forms.map((form) => (
                <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/forms`} key={form.id}>
                  <strong>{form.name}</strong>
                  <p>{form.submissions} submissions - owned by {form.owner}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

