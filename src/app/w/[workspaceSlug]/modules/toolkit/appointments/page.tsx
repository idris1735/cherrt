"use client";

import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitAppointmentsPage() {
  const { snapshot } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const appointments = snapshot.appointments;
  const nextUp = appointments[0];
  const rest = appointments.slice(1);

  return (
    <div className="tk-page">
      <div className="tk-page-head">
        <div className="tk-page-head__copy">
          <p className="tk-eyebrow">Scheduling</p>
          <h1 className="tk-page-title">Appointments</h1>
          <p className="tk-page-desc">
            Operational meetings, sign-off sessions, and follow-up moments tracked in one place.
          </p>
        </div>
        <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
          Schedule new
        </Link>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-stack-lg">
          {nextUp ? (
            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Next up</p>
                  <h2 className="tk-card-title">{nextUp.title}</h2>
                </div>
                <span className="tk-badge">{nextUp.when}</span>
              </div>
              <div className="tk-detail-grid">
                <div className="tk-detail-cell">
                  <span>Time</span>
                  <strong>{nextUp.when}</strong>
                </div>
                <div className="tk-detail-cell">
                  <span>Owner</span>
                  <strong>{nextUp.owner}</strong>
                </div>
              </div>
              <div className="tk-card__actions">
                <Link className="button button--ghost" href={`${base}/appointments/${nextUp.id}`}>
                  Open detail
                </Link>
                <Link className="button button--ghost" href={`/w/${snapshot.workspace.slug}/chat`}>
                  Update in chat
                </Link>
                <Link className="tk-inline-link" href={`/w/${snapshot.workspace.slug}/chat`}>
                  Reschedule
                </Link>
              </div>
            </div>
          ) : null}

          {rest.length > 0 ? (
            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Upcoming</p>
                  <h2 className="tk-card-title">{rest.length} more appointment{rest.length !== 1 ? "s" : ""}</h2>
                </div>
              </div>
              <div className="tk-list">
                {rest.map((appt) => (
                  <Link className="tk-row" href={`${base}/appointments/${appt.id}`} key={appt.id}>
                    <div className="tk-row__main">
                      <strong>{appt.title}</strong>
                      <p>{appt.owner}</p>
                    </div>
                    <div className="tk-row__aside">
                      <span>{appt.when}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {appointments.length === 0 ? (
            <div className="tk-card">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Schedule</p>
                  <h2 className="tk-card-title">No appointments yet</h2>
                </div>
              </div>
              <div className="tk-soft-tile">
                <strong>Nothing scheduled</strong>
                <p>
                  Tell Chertt who to meet, what the purpose is, and when. It will create the appointment and keep it visible here.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Quick actions</p>
                <h2 className="tk-card-title">Scheduling options</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${snapshot.workspace.slug}/chat`}>
                <strong>Book a vendor meeting</strong>
                <p>Schedule supplier sign-off, delivery checks, or contract reviews.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${snapshot.workspace.slug}/chat`}>
                <strong>Set an onboarding session</strong>
                <p>Orientation appointments for new team members joining this week.</p>
              </Link>
              <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${snapshot.workspace.slug}/chat`}>
                <strong>Schedule a review</strong>
                <p>Facility walks, document reviews, or team check-in meetings.</p>
              </Link>
            </div>
          </div>

          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Summary</p>
                <h2 className="tk-card-title">Schedule at a glance</h2>
              </div>
            </div>
            <div className="tk-detail-grid">
              <div className="tk-detail-cell">
                <span>Total</span>
                <strong>{appointments.length}</strong>
              </div>
              <div className="tk-detail-cell">
                <span>Next up</span>
                <strong>{nextUp ? nextUp.when : "None"}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

