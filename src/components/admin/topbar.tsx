"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import s from "./admin-kit.module.css";

export function TopBar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
    const saved = window.localStorage.getItem("chertt-theme") as "light" | "dark" | null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      window.localStorage.setItem("chertt-theme", next);
      document.documentElement.setAttribute("data-chertt-theme", next);
      return next;
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }, [router]);

  return (
    <header className={s.topbar}>
      <div className={s.topbarLeft}>
        <button
          className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
          onClick={onMenuToggle}
          aria-label="Toggle menu"
          style={{ display: "none" }}
          data-mobile-menu
        >
          ☰
        </button>
        <span className={s.topbarTitle}>Admin</span>
      </div>
      <div className={s.topbarRight}>
        <button className={s.themeBtn} onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "light" ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2a6 6 0 000 12 6 6 0 006-6 4.5 4.5 0 01-6-6z" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3" /><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.9 11.9l1.06 1.06M3.05 12.95l1.06-1.06M11.9 4.1l1.06-1.06" strokeLinecap="round" /></svg>
          )}
        </button>
        <span className={s.topbarUser}>{email ?? "..."}</span>
        <button className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={signOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
