"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

const laneTitles = {
  pulse: "Staff pulse",
  approval: "Approval review",
  guest: "Guest feedback",
} as const;

function buildQuestions(lane: keyof typeof laneTitles) {
  if (lane === "pulse") {
    return [
      "How clear were this week's operating priorities?",
      "What slowed your team down most this week?",
      "Did you get decisions fast enough to move work forward?",
      "Where should leadership remove friction next?",
    ];
  }

  if (lane === "approval") {
    return [
      "Is the draft ready for sign-off?",
      "What needs to change before approval?",
      "Does the content reflect the intended message clearly?",
      "Who still needs to review this before release?",
    ];
  }

  return [
    "How smooth was your arrival experience?",
    "Was the guidance from the team clear and timely?",
    "What part of the experience should improve next?",
    "Would you recommend this process to someone else?",
  ];
}

export default function ToolkitFeedbackDetailPage() {
  const params = useParams<{ pollId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const poll = snapshot.polls.find((entry) => entry.id === params.pollId);

  if (!poll) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Poll detail</p>
              <h2 className="tk-card-title">Poll not found</h2>
            </div>
            <Link className="tk-inline-link" href={`${base}/feedback`}>
              Back to feedback
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const responseRate = poll.targetCount > 0 ? Math.round((poll.responseCount / poll.targetCount) * 100) : 0;
  const questions = buildQuestions(poll.lane);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">{laneTitles[poll.lane]}</p>
          <h1 className="tk-page-title">{poll.title}</h1>
          <p className="tk-page-desc">
            Structured feedback for {poll.audience}, owned by {poll.owner}.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/feedback`}>
          Back to feedback
        </Link>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-stack-lg">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Summary</p>
                <h2 className="tk-card-title">Poll details</h2>
              </div>
            </div>
            <div className="tk-detail-grid">
              <div className="tk-detail-cell">
                <span>Status</span>
                <strong>{poll.status}</strong>
              </div>
              <div className="tk-detail-cell">
                <span>Audience</span>
                <strong>{poll.audience}</strong>
              </div>
              <div className="tk-detail-cell">
                <span>Responses</span>
                <strong>{poll.responseCount}</strong>
              </div>
              <div className="tk-detail-cell">
                <span>Response rate</span>
                <strong>{responseRate}%</strong>
              </div>
            </div>
            <div className="tk-card__actions">
              <Link className="button button--primary" href={`${base}/chat`}>
                Update in chat
              </Link>
              <Link className="button button--ghost" href={`${base}/forms`}>
                Open related forms
              </Link>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Question set</p>
                <h2 className="tk-card-title">{poll.questionCount} prompts in this poll</h2>
              </div>
            </div>
            <div className="tk-steps">
              {questions.map((question, index) => (
                <div className="tk-step" key={question}>
                  <span className="tk-step__dot is-done" />
                  <div>
                    <strong>Question {index + 1}</strong>
                    <p>{question}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Response snapshot</p>
                <h2 className="tk-card-title">Where it stands now</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <div className="tk-soft-line">Responses collected: {poll.responseCount}</div>
              <div className="tk-soft-line">Target audience size: {poll.targetCount}</div>
              <div className="tk-soft-line">Last updated: {poll.updatedAtLabel}</div>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Next actions</p>
                <h2 className="tk-card-title">Move feedback forward</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`}>
                <strong>Send a reminder</strong>
                <p>Ask Chertt to remind the remaining audience and push response rate higher.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/chat`}>
                <strong>Summarize the responses</strong>
                <p>Turn the feedback into a short decision-ready summary for leadership.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/requests`}>
                <strong>Open follow-up work</strong>
                <p>Convert findings into a trackable approval, issue, or internal request.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
