"use client";

import { PropsWithChildren, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/shared/brand-mark";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

// The global-hub slug is the public demo workspace — always accessible without auth.
const DEMO_SLUG = "global-hub";

export function WorkspaceAccessGuard({
  children,
  workspaceSlug,
}: PropsWithChildren<{ workspaceSlug: string }>) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (workspaceSlug === DEMO_SLUG) {
      setReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      // Supabase not configured (local dev without env vars) — allow through.
      setReady(true);
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace(`/auth/sign-in`);
      } else {
        setReady(true);
      }
    });
  }, [workspaceSlug, router]);

  if (!ready) {
    return (
      <div className="workspace-loader-overlay workspace-loader-overlay--page" role="status" aria-live="polite">
        <div className="workspace-loader-card">
          <BrandMark compact />
          <div className="workspace-loader-spinner" />
          <p>Opening your workspace...</p>
        </div>
      </div>
    );
  }

  return children;
}
