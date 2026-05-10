"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

import { useAppState } from "@/components/providers/app-state-provider";

const NAV_ITEMS = [
  { label: "Overview",     href: "",               icon: "⊞" },
  { label: "Requests",     href: "/requests",      icon: "✅" },
  { label: "Expenses",     href: "/expenses",      icon: "₦" },
  { label: "Documents",    href: "/documents",     icon: "📄" },
  { label: "Inventory",    href: "/inventory",     icon: "📦" },
  { label: "Issues",       href: "/issues",        icon: "🔧" },
  { label: "Directory",    href: "/directory",     icon: "👥" },
  { label: "Forms",        href: "/forms",         icon: "📋" },
  { label: "Feedback",     href: "/feedback",      icon: "📊" },
  { label: "Appointments", href: "/appointments",  icon: "📅" },
  { label: "Knowledge",    href: "/knowledge",     icon: "📚" },
  { label: "Onboarding",   href: "/onboarding",   icon: "🚀" },
] as const;

export function ToolkitShell({
  children,
  workspaceSlug,
}: PropsWithChildren<{ workspaceSlug: string }>) {
  const { snapshot } = useAppState();
  const pathname = usePathname();
  const base = `/w/${workspaceSlug}/modules/toolkit`;
  const chatHref = `/w/${workspaceSlug}/chat`;

  return (
    <div className="tk-shell">
      <header className="tk-topbar">
        <div className="tk-topbar__brand">
          <Image alt="Chertt" className="tk-topbar__logo" height={26} priority src="/logo.png" width={26} />
          <span className="tk-topbar__name">{snapshot.workspace.name}</span>
        </div>
        <Link className="tk-topbar__back" href={chatHref}>
          ← Back to chat
        </Link>
      </header>

      <div className="tk-layout">
        <aside className="tk-sidebar">
          <nav className="tk-sidebar__nav">
            {NAV_ITEMS.map(({ label, href, icon }) => {
              const fullHref = `${base}${href}`;
              const isActive = href === ""
                ? pathname === base || pathname === `${base}/`
                : pathname.startsWith(fullHref);
              return (
                <Link
                  key={label}
                  href={fullHref}
                  className={`tk-sidebar__link${isActive ? " is-active" : ""}`}
                >
                  <span className="tk-sidebar__icon">{icon}</span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="tk-main">{children}</main>
      </div>
    </div>
  );
}
