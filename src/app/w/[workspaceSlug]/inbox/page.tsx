"use client";

import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import { StatusPill } from "@/components/shared/status-pill";
import { formatCurrency } from "@/lib/format";

export default function InboxPage() {
  const { snapshot, approveRequest } = useAppState();
  const pendingRequests = snapshot.requests.filter((request) => request.status === "pending");
  const openRequests = snapshot.requests.filter((request) => request.status !== "approved" && request.status !== "completed");
  const unreadNotifications = snapshot.notifications.filter((notification) => !notification.read);
  const base = `/w/${snapshot.workspace.slug}`;

  return (
    <div className="inbox-min">
      <header className="inbox-min__head">
        <div>
          <p className="inbox-min__eyebrow">Inbox</p>
          <h1>Decision queue</h1>
          <p>Minimal view for approvals and updates that need action now.</p>
        </div>
        <Link className="button button--ghost" href={`${base}/modules/toolkit/requests`}>
          Open full requests
        </Link>
      </header>

      <section className="inbox-min__stats" aria-label="Inbox stats">
        <div className="inbox-min__stat">
          <span>Pending</span>
          <strong>{pendingRequests.length}</strong>
        </div>
        <div className="inbox-min__stat">
          <span>Open items</span>
          <strong>{openRequests.length}</strong>
        </div>
        <div className="inbox-min__stat">
          <span>Unread updates</span>
          <strong>{unreadNotifications.length}</strong>
        </div>
      </section>

      <div className="inbox-min__grid">
        <section className="inbox-min__panel">
          <div className="inbox-min__panel-head">
            <h2>Needs approval</h2>
            <span>{pendingRequests.length}</span>
          </div>

          <div className="inbox-min__list">
            {pendingRequests.length ? (
              pendingRequests.map((request) => (
                <article className="inbox-min__item" key={request.id}>
                  <div className="inbox-min__item-main">
                    <div className="inbox-min__item-top">
                      <p>{request.type}</p>
                      <StatusPill status={request.status} />
                    </div>
                    <strong>{request.title}</strong>
                    <p>{request.requester}</p>
                  </div>

                  <div className="inbox-min__item-meta">
                    {request.amount ? <span>{formatCurrency(request.amount, snapshot.workspace.currency)}</span> : null}
                    <small>{request.createdAtLabel}</small>
                  </div>

                  <div className="inbox-min__item-actions">
                    <Link className="tk-inline-link" href={`${base}/modules/toolkit/requests/${request.id}`}>
                      View details
                    </Link>
                    <button className="button button--primary" onClick={() => approveRequest(request.id)} type="button">
                      Approve
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="inbox-min__empty">
                <strong>All clear</strong>
                <p>No pending approvals right now.</p>
              </div>
            )}
          </div>
        </section>

        <section className="inbox-min__panel inbox-min__panel--soft">
          <div className="inbox-min__panel-head">
            <h2>Latest updates</h2>
            <span>{snapshot.notifications.length}</span>
          </div>

          <div className="inbox-min__list">
            {snapshot.notifications.map((notification) => (
              <article className={`inbox-min__update ${notification.read ? "" : "is-unread"}`} key={notification.id}>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.detail}</p>
                </div>
                <span>{notification.timeLabel}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
