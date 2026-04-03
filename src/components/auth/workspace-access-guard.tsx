"use client";

import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";

import { getLastWorkspaceSlug, rememberLastWorkspaceSlug } from "@/lib/services/onboarding-draft";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/services/supabase";
import { getFirstWorkspaceSlugForCurrentUser, workspaceExistsInSupabase } from "@/lib/services/supabase-workspace";

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
      if (!isSupabaseConfigured()) {
        router.replace("/auth/sign-in");
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
      const firstWorkspaceSlug = await getFirstWorkspaceSlugForCurrentUser();

      if (cancelled) {
        return;
      }

      if (workspaceSlug === "global-hub") {
        if (lastWorkspaceSlug && lastWorkspaceSlug !== "global-hub") {
          router.replace(pathname.replace("/w/global-hub", `/w/${lastWorkspaceSlug}`));
          return;
        }

        if (firstWorkspaceSlug) {
          rememberLastWorkspaceSlug(firstWorkspaceSlug);
          router.replace(pathname.replace("/w/global-hub", `/w/${firstWorkspaceSlug}`));
          return;
        }

        router.replace("/auth/modules");
        return;
      }

      const exists = await workspaceExistsInSupabase(workspaceSlug);

      if (cancelled) {
        return;
      }

      if (!exists) {
        if (lastWorkspaceSlug && lastWorkspaceSlug !== "global-hub" && lastWorkspaceSlug !== workspaceSlug) {
          router.replace(pathname.replace(`/w/${workspaceSlug}`, `/w/${lastWorkspaceSlug}`));
          return;
        }

        if (firstWorkspaceSlug && firstWorkspaceSlug !== workspaceSlug) {
          rememberLastWorkspaceSlug(firstWorkspaceSlug);
          router.replace(pathname.replace(`/w/${workspaceSlug}`, `/w/${firstWorkspaceSlug}`));
          return;
        }

        router.replace("/auth/modules");
        return;
      }

      rememberLastWorkspaceSlug(workspaceSlug);
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
          <p>Chertt is confirming your session and matching you to the right workspace.</p>
        </div>
      </div>
    );
  }

  return children;
}
