"use client";

import Image from "next/image";
import { PropsWithChildren, useEffect, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import type { Membership, Workspace } from "@/lib/types";
import styles from "@/components/shell/workspace-shell.module.css";

export function WorkspaceShell({
  children,
  workspaceSlug: _workspaceSlug,
  workspace: _workspace,
  membership: _membership,
}: PropsWithChildren<{ workspaceSlug: string; workspace: Workspace; membership: Membership }>) {
  const { snapshot } = useAppState();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("chertt-theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }

    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(systemPrefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("chertt-theme", theme);
    document.documentElement.setAttribute("data-chertt-theme", theme);
  }, [theme]);

  return (
    <div className={`${styles.shell} ${theme === "dark" ? styles.dark : styles.light}`}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Image alt="Chertt" className={styles.logo} height={28} priority src="/logo.png" width={28} />
        </div>

        <div className={styles.meta}>
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className={styles.themeToggle}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            type="button"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <div className={styles.avatar} title={`${snapshot.membership.userName} (${snapshot.membership.title})`}>
            {snapshot.membership.avatarInitials}
          </div>
        </div>
      </header>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
