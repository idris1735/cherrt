"use client";

import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { toolkitOnboardingChecklist } from "@/lib/data/toolkit";

export default function ToolkitOnboardingPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const owners = snapshot.directory.slice(0, 3);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">People</p>
          <h1 className="tk-page-title">Staff onboarding</h1>
          <p className="tk-page-desc">
            Give new team members a clear first-week path with owners, orientation appointments, and setup steps.
          </p>
        </div>
        <Link className="button button--primary" href={`${base}/appointments`}>
          Set orientation
        </Link>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-stack-lg">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Default checklist</p>
                <h2 className="tk-card-title">Onboarding steps</h2>
              </div>
            </div>
            <div className="tk-onboarding-list">
              {toolkitOnboardingChecklist.map((item, i) => (
                <div className="tk-onboarding-step" key={item}>
                  <div className="tk-onboarding-step__num">{i + 1}</div>
                  <div className="tk-onboarding-step__body">
                    <strong>{item}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Resources</p>
                <h2 className="tk-card-title">What new starters need</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/documents`}>
                <strong>Policy and compliance documents</strong>
                <p>Staff handbook, code of conduct, and compliance reading are available in Smart Documents.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/knowledge`}>
                <strong>Process knowledge</strong>
                <p>Common questions and operational notes are searchable via the knowledge base and chat.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/appointments`}>
                <strong>First-week orientation</strong>
                <p>Schedule an orientation appointment to walk the new team member through operations.</p>
              </Link>
              <Link className="button button--ghost" href={`${base}/appointments`}>
                Book an orientation
              </Link>
            </div>
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Onboarding owners</p>
                <h2 className="tk-card-title">Who helps new starters</h2>
              </div>
            </div>
            {owners.length ? (
              <div className="tk-list">
                {owners.map((person) => (
                  <Link className="tk-row tk-row--link" href={`${base}/directory/${person.id}`} key={person.id}>
                    <div className="tk-row__main">
                      <strong>{person.name}</strong>
                      <p>{person.title} - {person.unit}</p>
                    </div>
                    <div className="tk-row__aside">
                      <span>{person.phone}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="tk-soft-tile">
                <strong>No owners assigned</strong>
                <p>Add staff to the directory to assign onboarding owners.</p>
              </div>
            )}
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Quick links</p>
                <h2 className="tk-card-title">Related sections</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/directory`}>
                <strong>Staff directory</strong>
                <p>Find team members and contact details.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/knowledge`}>
                <strong>Process knowledge</strong>
                <p>Operational notes and FAQs for new starters to reference.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/documents`}>
                <strong>Smart documents</strong>
                <p>Policy documents and signed onboarding paperwork.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
