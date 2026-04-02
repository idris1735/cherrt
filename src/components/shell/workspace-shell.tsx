"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";
import clsx from "clsx";

import { BrandMark } from "@/components/shared/brand-mark";
import { useAppState } from "@/components/providers/app-state-provider";
import { pluralize } from "@/lib/format";
import type { Membership, Workspace } from "@/lib/types";

const navItems = [
  { href: "home", label: "Home" },
  { href: "chat", label: "Chat" },
  { href: "modules", label: "Modules" },
  { href: "inbox", label: "Inbox" },
  { href: "records", label: "Records" },
  { href: "settings", label: "Settings" },
];

function ComposerDock({ workspaceSlug }: { workspaceSlug: string }) {
  const { snapshot } = useAppState();
  const pending = snapshot.requests.filter((request) => request.status === "pending").length;

  return (
    <div className="composer-dock">
      <div>
        <p className="composer-dock__label">Command dock</p>
        <strong>Draft, capture, search, or route work in one step.</strong>
      </div>
      <div className="composer-dock__actions">
        <Link href={`/w/${workspaceSlug}/chat`} className="button button--primary">
          Open AI Mode
        </Link>
        <span className="composer-dock__meta">{pluralize(pending, "approval")} waiting</span>
      </div>
    </div>
  );
}

export function WorkspaceShell({
  children,
  workspaceSlug,
  workspace,
  membership,
}: PropsWithChildren<{ workspaceSlug: string; workspace: Workspace; membership: Membership }>) {
  const pathname = usePathname();
  const { snapshot } = useAppState();
  const unread = snapshot.notifications.filter((notification) => !notification.read).length;
  const isToolkitRoute = pathname.includes(`/w/${workspaceSlug}/modules/toolkit`);

  if (isToolkitRoute) {
    return (
      <div className="workspace-shell workspace-shell--immersive">
        <div className="workspace-main workspace-main--immersive">
          <main className="workspace-content workspace-content--immersive">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-rail">
        <BrandMark />
        <div className="workspace-rail__meta">
          <p>Workspace</p>
          <h2>{workspace.name}</h2>
          <span>{workspace.city}</span>
        </div>
        <nav className="workspace-nav">
          {navItems.map((item) => {
            const href = `/w/${workspaceSlug}/${item.href}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={item.href} className={clsx("workspace-nav__link", active && "is-active")} href={href}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="workspace-rail__footer">
          <p>{membership.title}</p>
          <strong>{membership.userName}</strong>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <p className="workspace-topbar__eyebrow">Multi-tenant conversational workspace</p>
            <h1>{workspace.legalName}</h1>
          </div>
          <div className="workspace-topbar__cluster">
            <Link className="workspace-topbar__chip" href={`/w/${workspaceSlug}/inbox`}>
              {unread} updates
            </Link>
            <Link className="workspace-topbar__chip" href={`/auth/onboarding`}>
              Workspace switcher
            </Link>
            <div className="workspace-topbar__avatar">{membership.avatarInitials}</div>
          </div>
        </header>

        <main className="workspace-content">{children}</main>

        <ComposerDock workspaceSlug={workspaceSlug} />

        <nav className="workspace-mobile-nav">
          {navItems.slice(0, 5).map((item) => {
            const href = `/w/${workspaceSlug}/${item.href}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={item.href} className={clsx("workspace-mobile-nav__link", active && "is-active")} href={href}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
