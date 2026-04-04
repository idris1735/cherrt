"use client";

import Image from "next/image";
import Link from "next/link";
import { PropsWithChildren } from "react";

import { useAppState } from "@/components/providers/app-state-provider";

export function ToolkitShell({
  children,
  workspaceSlug,
}: PropsWithChildren<{ workspaceSlug: string }>) {
  const { snapshot } = useAppState();
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
      <div className="tk-body">{children}</div>
    </div>
  );
}
