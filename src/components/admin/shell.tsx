"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import { Sidebar } from "@/components/admin/sidebar";
import { TopBar } from "@/components/admin/topbar";
import { CommandPalette, useCommandPalette } from "@/components/admin/command-palette";
import { ToastHost } from "@/components/admin/toast";
import "./admin.css";

/** Wraps every admin dashboard page — Kimi design shell, real session identity. */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingKyc, setPendingKyc] = useState<number | null>(null);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/auth/sign-in");
        return;
      }
      setEmail(data.session.user?.email ?? null);
      setReady(true);
    });
  }, [router]);

  // Real pending-KYC badge count for the sidebar + bell — fed by the overview endpoint.
  useEffect(() => {
    if (!email) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch("/api/admin/overview?period=7d", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const j = await res.json();
          if (typeof j?.overview?.pendingKyc === "number") setPendingKyc(j.overview.pendingKyc);
        }
      } catch {
        // badge is best-effort
      }
    });
  }, [email]);

  useEffect(() => {
    const onCollapse = () => setCollapsed((v) => !v);
    window.addEventListener("chertt:sidebar-collapse", onCollapse);
    return () => window.removeEventListener("chertt:sidebar-collapse", onCollapse);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (!ready) {
    return (
      <div className="app">
        <div className="content">
          <div className="page">
            <div className="skeleton" style={{ height: 200, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 16, width: "60%", marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: "40%" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="app">
        <div className="content">
          <div className="page">
            <div className="not-authorized">
              <div style={{ fontSize: 40, opacity: 0.3 }}>🔒</div>
              <h2>Sign in required</h2>
              <p>You need to sign in to access the admin dashboard.</p>
              <button className="btn btn-primary" onClick={() => { router.push("/auth/sign-in"); router.refresh(); }}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} collapsed={collapsed} pendingKyc={pendingKyc ?? 0} email={email} />
      <div className="content">
        <TopBar onMenuToggle={() => setSidebarOpen((v) => !v)} onPaletteOpen={() => setPaletteOpen(true)} pendingKyc={pendingKyc ?? 0} />
        {children}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastHost />
    </div>
  );
}
