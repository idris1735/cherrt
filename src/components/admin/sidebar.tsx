"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./admin-kit.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "Overview",
    icon: <svg className={s.sidebarLinkIcon} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="1" width="7" height="7" rx="1.5" /><rect x="10" y="1" width="7" height="7" rx="1.5" /><rect x="1" y="10" width="7" height="7" rx="1.5" /><rect x="10" y="10" width="7" height="7" rx="1.5" /></svg>,
  },
  {
    href: "/admin/churches",
    label: "Churches",
    icon: <svg className={s.sidebarLinkIcon} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 1v16" strokeLinecap="round" /><path d="M5 5h8" strokeLinecap="round" /><path d="M3 17h12" strokeLinecap="round" /><path d="M5 17v-4l4-2.5 4 2.5V17" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  },
  {
    href: "/admin/kyc",
    label: "KYC",
    icon: <svg className={s.sidebarLinkIcon} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 10.5a3 3 0 100-6 3 3 0 000 6z" /><path d="M3 16.5v-1a4 4 0 014-4h4a4 4 0 014 4v1" strokeLinecap="round" /></svg>,
  },
  {
    href: "/admin/people",
    label: "People",
    icon: <svg className={s.sidebarLinkIcon} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="5" r="3" /><path d="M1 16v-1a4 4 0 014-4h4a4 4 0 014 4v1" strokeLinecap="round" /><circle cx="13.5" cy="5" r="2" /><path d="M11 11.5a3 3 0 013-3h.5a3 3 0 013 3V13" strokeLinecap="round" /></svg>,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: <svg className={s.sidebarLinkIcon} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="2.5" /><path d="M9 1v1.5M9 15.5V17M1 9h1.5M15.5 9H17M3.3 3.3l1.1 1.1M13.6 13.6l1.1 1.1M3.3 14.7l1.1-1.1M13.6 4.4l1.1-1.1" strokeLinecap="round" /></svg>,
  },
];

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <aside className={`${s.sidebar} ${open ? s.open : ""}`}>
        <div className={s.sidebarBrand}>
          <span className={s.sidebarBrandDot} />
          Chertt
        </div>
        <nav className={s.sidebarNav}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${s.sidebarLink} ${active ? s.sidebarLinkActive : ""}`}
                onClick={onClose}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={s.sidebarFooter}>Chertt Admin &middot; v1.0</div>
      </aside>
      {open && <div className={`${s.sidebarOverlay} ${s.show}`} onClick={onClose} />}
    </>
  );
}
