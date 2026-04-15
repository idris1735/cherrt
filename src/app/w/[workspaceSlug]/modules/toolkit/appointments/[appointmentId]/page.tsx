"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useAppState } from "@/components/providers/app-state-provider";

export default function ToolkitAppointmentDetailPage() {
  const params = useParams<{ appointmentId: string; workspaceSlug: string }>();
  const { snapshot } = useAppState();
  const chatHref = `/w/${params.workspaceSlug}/chat`;

  const appointment = snapshot.appointments.find((entry) => entry.id === params.appointmentId);

  if (!appointment) {
    return (
      <div className="tk-page">
        <div className="tk-card">
          <div className="tk-card-head">
            <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
          </div>
          <p className="tk-eyebrow">Appointment</p>
          <h2 className="tk-card-title">Appointment not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-page">
      <div className="tk-card">
        <div className="tk-card-head">
          <Link className="tk-inline-link" href={chatHref}>← Back to chat</Link>
        </div>
        <p className="tk-eyebrow">Appointment</p>
        <h2 className="tk-card-title">{appointment.title}</h2>
        <div className="tk-detail-stat-grid">
          <div className="tk-detail-stat">
            <span>When</span>
            <strong>{appointment.when}</strong>
          </div>
          <div className="tk-detail-stat">
            <span>Owner</span>
            <strong>{appointment.owner}</strong>
          </div>
        </div>
        <div className="tk-card__actions">
          <Link className="button button--primary" href={chatHref}>Update in chat →</Link>
        </div>
      </div>
    </div>
  );
}
