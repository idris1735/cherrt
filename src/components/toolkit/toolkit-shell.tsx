"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren, useState } from "react";
import clsx from "clsx";

import { useAppState } from "@/components/providers/app-state-provider";

const navItems = [
  {
    href: "",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 11.5 12 5l7 6.5V19H5V11.5Z" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 11.5 12 5l7 6.5V19H5V11.5Z" />
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 7.5A3.5 3.5 0 0 1 10 4h4a3.5 3.5 0 0 1 3.5 3.5v5A3.5 3.5 0 0 1 14 16h-3.5L7 19v-3.3A3.5 3.5 0 0 1 6.5 13V7.5Z" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 4h4a3.5 3.5 0 0 1 3.5 3.5v5A3.5 3.5 0 0 1 14 16h-3.5L7 19v-3.3A3.5 3.5 0 0 1 6.5 13V7.5A3.5 3.5 0 0 1 10 4Z" />
      </svg>
    ),
  },
  {
    href: "/requests",
    label: "Requests",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4.5h6" />
        <path d="M8 6.5h8A2.5 2.5 0 0 1 18.5 9v9A2.5 2.5 0 0 1 16 20.5H8A2.5 2.5 0 0 1 5.5 18V9A2.5 2.5 0 0 1 8 6.5Z" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 6.5h8A2.5 2.5 0 0 1 18.5 9v9A2.5 2.5 0 0 1 16 20.5H8A2.5 2.5 0 0 1 5.5 18V9A2.5 2.5 0 0 1 8 6.5Z" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" fill="none" stroke="#f4f1ec" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9 4.5h6" fill="none" stroke="#f4f1ec" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/records",
    label: "Records",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5H12l2 2h2.5A2.5 2.5 0 0 1 19 9.5v7A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-9Z" />
        <path d="M8.5 12h7M8.5 15.5h5" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5H12l2 2h2.5A2.5 2.5 0 0 1 19 9.5v7A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-9Z" />
        <path d="M8.5 12h7M8.5 15.5h5" fill="none" stroke="#f4f1ec" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/directory",
    label: "People",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8.5" r="3" />
        <circle cx="16.5" cy="10" r="2.5" />
        <path d="M4.5 19a5 5 0 0 1 9 0M13.5 18.5a4 4 0 0 1 6 0" />
      </svg>
    ),
    iconActive: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="8.5" r="3" />
        <circle cx="16.5" cy="10" r="2.5" />
        <path d="M4.5 19a5 5 0 0 1 9 0M13.5 18.5a4 4 0 0 1 6 0" />
      </svg>
    ),
  },
] as const;

const recordRoutes = ["/records", "/documents", "/inventory", "/issues", "/expenses", "/forms", "/appointments", "/feedback", "/knowledge"];
const peopleRoutes = ["/directory", "/onboarding"];

export function ToolkitShell({
  children,
  workspaceSlug,
}: PropsWithChildren<{ workspaceSlug: string }>) {
  const pathname = usePathname();
  const { snapshot, markNotificationsRead } = useAppState();
  const base = `/w/${workspaceSlug}/modules/toolkit`;
  const unread = snapshot.notifications.filter((n) => !n.read).length;
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  function getNotificationHref(kind: string) {
    if (kind === "approval") return `${base}/requests`;
    if (kind === "payment") return `${base}/expenses`;
    if (kind === "event") return `${base}/appointments`;
    return `${base}/chat`;
  }

  function isActive(href: string) {
    const full = `${base}${href}`;
    if (href === "") return pathname === full;
    if (href === "/records") return recordRoutes.some((r) => pathname.startsWith(`${base}${r}`));
    if (href === "/directory") return peopleRoutes.some((r) => pathname.startsWith(`${base}${r}`));
    return pathname.startsWith(full);
  }

  return (
    <div className="tk-shell">
      {/* Minimal topbar */}
      <header className="tk-topbar">
        <div className="tk-topbar__brand">
          <Image alt="Chertt" className="tk-topbar__logo" height={26} priority src="/logo.png" width={26} />
          <span className="tk-topbar__name">Chertt</span>
        </div>
        <div className="tk-topbar__right">
          <span className="tk-topbar__workspace">{snapshot.workspace.name}</span>
          <button
            aria-expanded={notificationsOpen}
            aria-label="Notifications"
            className={clsx("tk-topbar__bell", notificationsOpen && "is-active")}
            onClick={() => {
              const next = !notificationsOpen;
              setNotificationsOpen(next);
              if (next && unread > 0) {
                markNotificationsRead();
              }
            }}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 18h8M10 21h4M6.5 18V11a5.5 5.5 0 1 1 11 0v7l1.5 1.5H5L6.5 18Z" />
            </svg>
            {unread > 0 ? <span className="tk-topbar__badge" /> : null}
          </button>
          <Link aria-label="Profile" className="tk-topbar__profile" href={`${base}/directory`}>
            {snapshot.membership.avatarInitials}
          </Link>
        </div>
      </header>

      {notificationsOpen ? (
        <div className="tk-notifications" role="dialog" aria-label="Notifications">
          <button
            aria-label="Close notifications"
            className="tk-notifications__backdrop"
            onClick={() => setNotificationsOpen(false)}
            type="button"
          />
          <aside className="tk-notifications__panel">
            <div className="tk-notifications__head">
              <div>
                <p className="tk-eyebrow">Notifications</p>
                <h2 className="tk-card-title">What needs your attention</h2>
              </div>
              <Link className="tk-inline-link" href={`/w/${workspaceSlug}/inbox`} onClick={() => setNotificationsOpen(false)}>
                Open inbox
              </Link>
            </div>

            <div className="tk-notifications__list">
              {snapshot.notifications.length ? (
                snapshot.notifications.map((notification) => (
                  <Link
                    className={clsx("tk-notifications__item", !notification.read && "is-unread")}
                    href={getNotificationHref(notification.kind)}
                    key={notification.id}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    <div className="tk-notifications__item-main">
                      <strong>{notification.title}</strong>
                      <p>{notification.detail}</p>
                    </div>
                    <span>{notification.timeLabel}</span>
                  </Link>
                ))
              ) : (
                <div className="tk-soft-tile">
                  <strong>No new notifications</strong>
                  <p>Requests, chat updates, and approvals will appear here.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {/* Page content */}
      <div className="tk-body">{children}</div>

      {/* Floating island nav */}
      <nav aria-label="Toolkit navigation" className="tk-island">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href || "home"}
              className={clsx("tk-island__item", active && "is-active")}
              href={`${base}${item.href}`}
            >
              <span className="tk-island__icon">
                {active ? item.iconActive : item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
