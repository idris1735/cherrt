"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitDirectoryPersonPage() {
  const params = useParams<{ personId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const person = snapshot.directory.find((entry) => entry.id === params.personId);

  if (!person) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Person detail</p>
              <h2 className="tk-card-title">Staff member not found</h2>
            </div>
            <Link className="tk-inline-link" href={`${base}/directory`}>
              Back to directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const initials = person.name
    .split(" ")
    .map((value) => value[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Person detail</p>
          <h1 className="tk-page-title">{person.name}</h1>
          <p className="tk-page-desc">
            Reach the right person quickly and continue the task in chat, onboarding, or process recall.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/directory`}>
          Back to directory
        </Link>
      </div>

      <div className="tk-detail-hero">
        <div className="tk-detail-hero__media">
          <span className="tk-detail-hero__badge">Staff profile</span>
          <div className="tk-person-hero__avatar">{initials}</div>
        </div>
        <div className="tk-detail-hero__content">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Directory record</p>
              <h2 className="tk-card-title">{person.name}</h2>
            </div>
            <span className="tk-badge">Available contact</span>
          </div>

          <div className="tk-detail-stat-grid">
            <div className="tk-detail-stat">
              <span>Title</span>
              <strong>{person.title}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Unit</span>
              <strong>{person.unit}</strong>
            </div>
            <div className="tk-detail-stat">
              <span>Phone</span>
              <strong>{person.phone}</strong>
            </div>
          </div>

          <p className="tk-detail-hero__note">
            Use the directory to jump straight to the right person, then keep the work itself in the relevant Chertt flow.
          </p>

          <div className="tk-card__actions">
            <a className="button button--primary" href={`tel:${person.phone}`}>
              Call now
            </a>
            <Link className="button button--ghost" href={`${base}/chat`}>
              Continue in chat
            </Link>
          </div>
        </div>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Best used for</p>
              <h2 className="tk-card-title">How this person fits the flow</h2>
            </div>
          </div>
          <div className="tk-mini-stack">
            <div className="tk-soft-line">Reach them quickly when a request, issue, or document needs a human owner.</div>
            <div className="tk-soft-line">Use chat to pull them into the context without losing the work trail.</div>
            <div className="tk-soft-line">Keep onboarding and knowledge flows aligned to the correct unit.</div>
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Related sections</p>
                <h2 className="tk-card-title">Keep moving</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/onboarding`}>
                <strong>Staff onboarding</strong>
                <p>Checklists, owner setup, and first-week tasks.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/knowledge`}>
                <strong>Process knowledge</strong>
                <p>Operational notes and FAQs linked to work context.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/directory`}>
                <strong>Back to directory</strong>
                <p>Return to the full staff list and move to another unit.</p>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
