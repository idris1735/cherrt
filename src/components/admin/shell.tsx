"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import { Sidebar } from "@/components/admin/sidebar";
import { TopBar } from "@/components/admin/topbar";
import s from "./admin-kit.module.css";

/** Wraps every admin dashboard page. Provides the sidebar + topbar shell. */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (!ready) {
    return (
      <div className={s.adminShell}>
        <div className={s.adminMain}>
          <div className={s.adminContent}>
            <div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} />
            <div className={s.skeleton} style={{ height: 16, width: "60%", marginBottom: 8 }} />
            <div className={s.skeleton} style={{ height: 16, width: "40%" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className={s.adminShell}>
        <div className={s.adminMain}>
          <div className={s.adminContent}>
            <div className={s.authBlock}>
              <div className={s.authBlockIcon}>🔒</div>
              <div className={s.authBlockTitle}>Sign in required</div>
              <div className={s.authBlockBody}>You need to sign in to access the admin dashboard.</div>
              <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => { router.push("/auth/sign-in"); router.refresh(); }}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.adminShell}>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className={s.adminMain}>
        <TopBar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <div className={s.adminContent}>{children}</div>
      </div>
    </div>
  );
}
