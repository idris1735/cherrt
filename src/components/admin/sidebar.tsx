"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: React.ReactNode; group: string };

const NAV_ITEMS: NavItem[] = [
  {
    group: "Platform",
    href: "/admin",
    label: "Overview",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  },
  {
    group: "Platform",
    href: "/admin/churches",
    label: "Churches",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>,
  },
  {
    group: "Platform",
    href: "/admin/people",
    label: "People",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
  {
    group: "Platform",
    href: "/admin/kyc",
    label: "KYC",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  },
  {
    group: "Platform",
    href: "/admin/data-requests",
    label: "Data Requests",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  },
  {
    group: "System",
    href: "/admin/settings",
    label: "Settings",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  },
];

export function Sidebar({ open, onClose, collapsed, pendingKyc, email }: { open?: boolean; onClose?: () => void; collapsed?: boolean; pendingKyc?: number; email?: string | null }) {
  const pathname = usePathname();
  const initials = (email ?? "A").slice(0, 2).toUpperCase();

  const groups: [string, NavItem[]][] = [...new Set(NAV_ITEMS.map((i) => i.group))].map((g) => [g, NAV_ITEMS.filter((i) => i.group === g)]);

  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-icon">C</div>
          <span className="brand-text">Chertt Admin</span>
        </div>
        <button
          className="sidebar-toggle"
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
          data-collapsed={collapsed ? "true" : "false"}
          data-sidebar-toggle
        >
          ◀
        </button>
        <nav className="nav">
          {groups.map(([group, groupItems]) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-title">{group}</div>
              {groupItems.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                const showBadge = item.href === "/admin/kyc" && typeof pendingKyc === "number" && pendingKyc > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${active ? "active" : ""}`}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                  >
                    {item.icon}
                    <span className="nav-label">{item.label}</span>
                    {showBadge && (
                      <span className="badge badge-accent" style={{ marginLeft: "auto", fontSize: 10, padding: "2px 6px" }}>{pendingKyc}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{initials}</div>
            <span style={{ fontWeight: 500, color: "var(--ink)" }} className="truncate">{email ?? "Platform admin"}</span>
          </div>
          <div>Platform Admin</div>
        </div>
      </aside>
      <div className={`drawer-overlay ${open ? "open" : ""}`} onClick={onClose} />
    </>
  );
}
