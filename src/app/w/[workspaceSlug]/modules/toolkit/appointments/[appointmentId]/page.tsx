"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitAppointmentDetailPage() {
  const params = useParams<{ appointmentId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const base = `/w/${params.workspaceSlug}/modules/toolkit`;

  const appointment = snapshot.appointments.find((entry) => entry.id === params.appointmentId);

  if (!appointment) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Appointment detail</p>
              <h2 className="tk-card-title">Appointment not found</h2>
            </div>
            <Link className="tk-inline-link" href={`${base}/appointments`}>
              Back to appointments
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
          <p className="tk-eyebrow">Appointment detail</p>
          <h1 className="tk-page-title">{appointment.title}</h1>
          <p className="tk-page-desc">
            Scheduled for {appointment.when} and currently owned by {appointment.owner}.
          </p>
        </div>
        <Link className="tk-inline-link" href={`${base}/appointments`}>
          Back to appointments
        </Link>
      </div>

      <div className="tk-layout-2 tk-layout-2--balanced">
        <div className="tk-card">
          <div className="tk-card-head">
            <div className="tk-card-head__copy">
              <p className="tk-eyebrow">Schedule</p>
              <h2 className="tk-card-title">{appointment.title}</h2>
            </div>
            <span className="tk-badge">{appointment.when}</span>
          </div>
          <div className="tk-detail-grid">
            <div className="tk-detail-cell">
              <span>Owner</span>
              <strong>{appointment.owner}</strong>
            </div>
            <div className="tk-detail-cell">
              <span>When</span>
              <strong>{appointment.when}</strong>
            </div>
            <div className="tk-detail-cell">
              <span>Status</span>
              <strong>Scheduled</strong>
            </div>
            <div className="tk-detail-cell">
              <span>Source</span>
              <strong>Chertt chat workflow</strong>
            </div>
          </div>
          <div className="tk-card__actions">
            <Link className="button button--primary" href={`/w/${params.workspaceSlug}/chat`}>
              Update in chat
            </Link>
            <Link className="button button--ghost" href={`${base}/appointments`}>
              View all appointments
            </Link>
          </div>
        </div>

        <div className="tk-side-stack">
          <div className="tk-card">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">What to do next</p>
                <h2 className="tk-card-title">Suggested follow-up</h2>
              </div>
            </div>
            <div className="tk-mini-stack">
              <div className="tk-soft-line">Ask Chertt to reschedule if the time changes.</div>
              <div className="tk-soft-line">Use chat to add meeting purpose, attendees, or prep notes.</div>
              <div className="tk-soft-line">Keep appointments linked to requests or documents as the workflow grows.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

