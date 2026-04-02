"use client";

import { useAppState } from "@/components/providers/app-state-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusPill } from "@/components/shared/status-pill";
import { SurfaceCard } from "@/components/shared/surface-card";
import { formatCurrency } from "@/lib/format";

export default function ChurchPage() {
  const { snapshot } = useAppState();

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="ChurchBase"
        title="Member-facing warmth with operational discipline"
        body="Child check-in, giving, first-timer capture, care requests, and event registration run on the same shared platform services."
      />

      <div className="two-column-grid">
        <SurfaceCard>
          <SectionHeading eyebrow="Giving and care" title="Pastoral and financial visibility" />
          {snapshot.giving.map((entry) => (
            <div className="record-card" key={entry.id}>
              <div>
                <strong>{entry.donor}</strong>
                <p>
                  {entry.channel} • {entry.service}
                </p>
              </div>
              <strong>{formatCurrency(entry.amount, snapshot.workspace.currency)}</strong>
            </div>
          ))}
          {snapshot.careRequests.map((entry) => (
            <div className="record-card" key={entry.id}>
              <div>
                <strong>{entry.requester}</strong>
                <p>{entry.type}</p>
              </div>
              <StatusPill status={entry.status} />
            </div>
          ))}
        </SurfaceCard>

        <SurfaceCard tone="accent">
          <SectionHeading eyebrow="Check-in and registration" title="Front-door hospitality" />
          {snapshot.registrations.map((registration) => (
            <div className="record-card" key={registration.id}>
              <div>
                <strong>{registration.attendee}</strong>
                <p>
                  {registration.eventTitle} • {registration.ticketType}
                </p>
              </div>
              <StatusPill status={registration.status} />
            </div>
          ))}
          {snapshot.checkIns.map((checkIn) => (
            <div className="record-card" key={checkIn.id}>
              <div>
                <strong>{checkIn.guest}</strong>
                <p>{checkIn.eventTitle}</p>
              </div>
              <span>{checkIn.checkedInAtLabel}</span>
            </div>
          ))}
        </SurfaceCard>
      </div>
    </div>
  );
}
