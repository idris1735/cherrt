"use client";

import React, { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

import type { Membership, Workspace } from "@/lib/types";
import styles from "@/components/shell/workspace-shell.module.css";

type ThemeContextValue = { theme: "dark" | "light"; toggleTheme: () => void };
export const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function WorkspaceShell({
  children,
  workspaceSlug: _workspaceSlug,
  workspace,
  membership: _membership,
}: PropsWithChildren<{ workspaceSlug: string; workspace: Workspace; membership: Membership }>) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // Read theme pre-applied by the inline script so the state matches
    // what's already on screen — no re-render flash.
    const preApplied = document.documentElement.getAttribute("data-chertt-theme");
    if (preApplied === "dark" || preApplied === "light") {
      setTheme(preApplied);
    } else {
      const saved = window.localStorage.getItem("chertt-theme");
      if (saved === "dark" || saved === "light") {
        setTheme(saved);
      } else {
        setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      }
    }

  }, []);

  useEffect(() => {
    window.localStorage.setItem("chertt-theme", theme);
    document.documentElement.setAttribute("data-chertt-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      <div
        className={`${styles.shell} ${theme === "dark" ? styles.dark : styles.light}`}
        style={{ "--ch-accent": workspace.brand.accent } as React.CSSProperties}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
