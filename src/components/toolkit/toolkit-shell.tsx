"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type PropsWithChildren, useCallback, useEffect, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import styles from "./toolkit-shell.module.css";

/* ─── Inline SVG line icons (24x24, 1.6 stroke, currentColor) ─── */

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </svg>
);

const IconRequests = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4.5h6" />
    <path d="M8 6.5h8A2.5 2.5 0 0 1 18.5 9v9A2.5 2.5 0 0 1 16 20.5H8A2.5 2.5 0 0 1 5.5 18V9A2.5 2.5 0 0 1 8 6.5Z" />
    <path d="M9 12.5l1.5 1.5 3-3" />
  </svg>
);

const IconExpenses = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10" />
    <path d="M14.5 9.5a2.5 2.5 0 0 0-5 0c0 1.4.9 2 2.5 2.5s2.5 1.1 2.5 2.5a2.5 2.5 0 0 1-5 0" />
  </svg>
);

const IconInventory = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 8.5 12 4l7.5 4.5v7L12 20l-7.5-4.5v-7Z" />
    <path d="M12 11.5 19.5 8" />
    <path d="M12 11.5 4.5 8" />
    <path d="M12 11.5V20" />
  </svg>
);

const IconIssues = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 4.5 3 17h18L13.7 4.5a2 2 0 0 0-3.4 0Z" />
  </svg>
);

const IconDocuments = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 4.5h5l3 3V19.5H8A2.5 2.5 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.5Z" />
    <path d="M13 4.5v4h4" />
    <path d="M9 12h6" />
    <path d="M9 15h4" />
  </svg>
);

const IconFeedback = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 6.5h14v8H9l-4 4v-12Z" />
    <path d="M9 10h6" />
    <path d="M9 7.5h4" />
  </svg>
);

const IconForms = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.5 5.5h9A2.5 2.5 0 0 1 19 8v8.5A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5V8A2.5 2.5 0 0 1 7.5 5.5Z" />
    <path d="M8.5 10h7" />
    <path d="M8.5 13.5h7" />
    <path d="M8.5 17h4" />
  </svg>
);

const IconAppointments = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4.5v3" />
    <path d="M17 4.5v3" />
    <path d="M5.5 8h13A1.5 1.5 0 0 1 20 9.5v9A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-9A1.5 1.5 0 0 1 5.5 8Z" />
    <path d="M4 11.5h16" />
  </svg>
);

const IconDirectory = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8.5" r="3" />
    <circle cx="16.5" cy="10" r="2.5" />
    <path d="M4.5 19a5 5 0 0 1 9 0" />
    <path d="M13.5 18.5a4 4 0 0 1 6 0" />
  </svg>
);

const IconKnowledge = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5Z" />
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
  </svg>
);

const IconOnboarding = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="2.5" />
    <path d="M5.5 18a4 4 0 0 1 7 0" />
    <path d="M15.5 7.5h4" />
    <path d="M17.5 5.5v4" />
  </svg>
);

const IconAskChertt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v4" />
    <path d="M12 17v4" />
    <path d="M3 12h4" />
    <path d="M17 12h4" />
    <path d="M5.6 5.6l2.8 2.8" />
    <path d="M15.6 15.6l2.8 2.8" />
    <path d="M5.6 18.4l2.8-2.8" />
    <path d="M15.6 8.4l2.8-2.8" />
  </svg>
);

const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconSun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="M4.93 4.93l1.41 1.41" />
    <path d="M17.66 17.66l1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="M6.34 17.66l-1.41 1.41" />
    <path d="M19.07 4.93l-1.41 1.41" />
  </svg>
);

const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  </svg>
);

const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

/* ─── Nav configuration ─── */

type NavItem = { label: string; href: string; icon: () => React.JSX.Element };

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard",    href: "",              icon: IconDashboard },
  { label: "Requests",     href: "/requests",     icon: IconRequests },
  { label: "Expenses",     href: "/expenses",     icon: IconExpenses },
  { label: "Inventory",    href: "/inventory",    icon: IconInventory },
  { label: "Issues",       href: "/issues",       icon: IconIssues },
  { label: "Documents",    href: "/documents",    icon: IconDocuments },
];

const SECONDARY_NAV: NavItem[] = [
  { label: "Feedback",     href: "/feedback",     icon: IconFeedback },
  { label: "Forms",        href: "/forms",        icon: IconForms },
  { label: "Appointments", href: "/appointments", icon: IconAppointments },
  { label: "Directory",    href: "/directory",    icon: IconDirectory },
  { label: "Knowledge",    href: "/knowledge",    icon: IconKnowledge },
  { label: "Onboarding",   href: "/onboarding",   icon: IconOnboarding },
];

const TAB_BAR_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "",              icon: IconDashboard },
  { label: "Requests",  href: "/requests",     icon: IconRequests },
  { label: "Expenses",  href: "/expenses",     icon: IconExpenses },
  { label: "Ask Chertt", href: "/chat",        icon: IconAskChertt },
];

/* ─── Shell component ─── */

export function ToolkitShell({
  children,
  workspaceSlug,
}: PropsWithChildren<{ workspaceSlug: string }>) {
  const { snapshot } = useAppState();
  const pathname = usePathname();
  const base = `/w/${workspaceSlug}/modules/toolkit`;
  const chatHref = `/w/${workspaceSlug}/chat`;

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close sidebar on larger screens
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const handle = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  // Lock body scroll when sidebar overlay is open on mobile
  useEffect(() => {
    if (sidebarOpen && window.innerWidth < 901) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  const isActive = useCallback(
    (href: string) => {
      const full = `${base}${href}`;
      if (href === "") return pathname === base || pathname === `${base}/`;
      if (href === "/chat") return pathname === chatHref || pathname.startsWith(`${chatHref}?`);
      return pathname.startsWith(full);
    },
    [base, chatHref, pathname],
  );

  const renderNavItem = (item: NavItem) => {
    const href = item.href === "/chat" ? chatHref : `${base}${item.href}`;
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.label}
        href={href}
        className={styles["tk2-nav-item"]}
        aria-current={active ? "page" : undefined}
      >
        <span className={styles["tk2-nav-icon"]}><Icon /></span>
        <span className={styles["tk2-nav-label"]}>{item.label}</span>
      </Link>
    );
  };

  const initials =
    snapshot.membership.avatarInitials ||
    snapshot.membership.userName
      .split(/\s+/)
      .map((n) => n[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    "?";

  return (
    <div className={styles["tk2-frame"]}>
      {/* ── Mobile overlay ── */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={`${styles["tk2-overlay"]}${sidebarOpen ? ` ${styles["is-open"]}` : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* ── Sidebar ── */}
      <aside className={`${styles["tk2-sidebar"]}${sidebarOpen ? ` ${styles["is-open"]}` : ""}`}>
        {/* Brand */}
        <div className={styles["tk2-brand"]}>
          <Image alt="Chertt" height={24} priority src="/logo.png" width={24} />
          <div className={styles["tk2-brand-copy"]}>
            <span className={styles["tk2-brand-wordmark"]}>Chertt</span>
            <span className={styles["tk2-brand-sub"]}>{snapshot.workspace.name}</span>
          </div>
        </div>

        {/* Primary nav */}
        <div className={styles["tk2-nav-section"]}>
          {PRIMARY_NAV.map(renderNavItem)}
        </div>

        <div className={styles["tk2-nav-divider"]} />

        {/* Secondary nav */}
        <div className={styles["tk2-nav-section"]}>
          {SECONDARY_NAV.map(renderNavItem)}
        </div>

        {/* Ask Chertt (bottom pinned) */}
        <div className={styles["tk2-ask-chertt"]}>
          <Link
            href={chatHref}
            className={styles["tk2-nav-item"]}
            aria-current={isActive("/chat") ? "page" : undefined}
          >
            <span className={styles["tk2-nav-icon"]}><IconAskChertt /></span>
            <span className={styles["tk2-nav-label"]}>Ask Chertt</span>
            <span className={styles["tk2-ask-dot"]} aria-hidden="true" />
          </Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className={styles["tk2-main"]}>
        {/* Topbar */}
        <header className={styles["tk2-topbar"]}>
          <div className={styles["tk2-topbar-left"]}>
            <button
              className={styles["tk2-hamburger"]}
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              {sidebarOpen ? <IconClose /> : <IconMenu />}
            </button>
            <span className={styles["tk2-topbar-title"]}>{snapshot.workspace.name}</span>
          </div>

          <div className={styles["tk2-topbar-right"]}>
            {/* Bell (stub) */}
            <button className={styles["tk2-topbar-btn"]} aria-label="Notifications">
              <IconBell />
            </button>

            {/* Avatar */}
            <span className={styles["tk2-avatar"]} aria-label={`Signed in as ${snapshot.membership.userName}`}>
              {initials}
            </span>
          </div>
        </header>

        {/* Content */}
        <div className={styles["tk2-content"]}>
          {children}
        </div>

        {/* Mobile bottom tab bar */}
        <div className={styles["tk2-tabbar"]}>
          <nav>
            {TAB_BAR_ITEMS.map((item) => {
              const href = item.href === "/chat" ? chatHref : `${base}${item.href}`;
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={href}
                  className={styles["tk2-tabbar-item"]}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

