"use client";

import { useAppState } from "@/components/providers/app-state-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatusPill } from "@/components/shared/status-pill";
import { SurfaceCard } from "@/components/shared/surface-card";

export default function EventsPage() {
  const { snapshot } = useAppState();

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Events"
        title="Invitations, RSVP, tickets, and guest access control"
        body="The event layer keeps guest communication, table detail, and QR check-in in the same operational story."
      />

      <div className="two-column-grid">
        <SurfaceCard>
          <SectionHeading eyebrow="Event records" title="Upcoming and active" />
          {snapshot.events.map((event) => (
            <div className="event-card" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <p>
                  {event.dateLabel} • {event.venue}
                </p>
              </div>
              <div className="event-card__stats">
                <span>{event.guestsExpected} expected</span>
                <span>{event.guestsCheckedIn} checked in</span>
              </div>
            </div>
          ))}
        </SurfaceCard>

        <SurfaceCard tone="ink">
          <SectionHeading eyebrow="Tickets and scanning" title="Guest access pulse" />
          {snapshot.tickets.map((ticket) => (
            <div className="record-card" key={ticket.id}>
              <div>
                <strong>{ticket.attendee}</strong>
                <p>
                  {ticket.eventTitle} • {ticket.code}
                </p>
              </div>
              <StatusPill status={ticket.status} />
            </div>
          ))}
          {snapshot.registrations.map((registration) => (
            <div className="record-card" key={registration.id}>
              <div>
                <strong>{registration.attendee}</strong>
                <p>{registration.ticketType}</p>
              </div>
              <StatusPill status={registration.status} />
            </div>
          ))}
        </SurfaceCard>
      </div>
    </div>
  );
}
