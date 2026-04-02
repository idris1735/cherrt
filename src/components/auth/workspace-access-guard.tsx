"use client";

import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";

import { getLastWorkspaceSlug } from "@/lib/services/onboarding-draft";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/services/supabase";
import { workspaceExistsInSupabase } from "@/lib/services/supabase-workspace";

const DEMO_SESSION_KEY = "chertt:demo-session";

export function WorkspaceAccessGuard({
  children,
  workspaceSlug,
}: PropsWithChildren<{ workspaceSlug: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "ready">("checking");

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      const hasDemoSession =
        typeof window !== "undefined" && window.localStorage.getItem(DEMO_SESSION_KEY) === "true";

      if (hasDemoSession && workspaceSlug === "global-hub") {
        if (!cancelled) {
          setStatus("ready");
        }
        return;
      }

      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setStatus("ready");
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        router.replace("/auth/sign-in");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (!session) {
        router.replace("/auth/sign-in");
        return;
      }

      const lastWorkspaceSlug = getLastWorkspaceSlug();
      if (workspaceSlug === "global-hub" && lastWorkspaceSlug && lastWorkspaceSlug !== "global-hub") {
        router.replace(pathname.replace("/w/global-hub", `/w/${lastWorkspaceSlug}`));
        return;
      }

      if (workspaceSlug !== "global-hub") {
        const exists = await workspaceExistsInSupabase(workspaceSlug);

        if (cancelled) {
          return;
        }

        if (!exists) {
          router.replace("/auth/modules");
          return;
        }
      }

      setStatus("ready");
    }

    void verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, workspaceSlug]);

  if (status !== "ready") {
    return (
      <div className="workspace-access-guard">
        <div className="workspace-access-guard__card">
          <p className="workspace-access-guard__eyebrow">Checking access</p>
          <h1>Opening your workspace.</h1>
          <p>Chertt is confirming your session and matching you to the right workspace before the demo continues.</p>
        </div>
      </div>
    );
  }

  return children;
}
