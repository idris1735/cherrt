"use client";

import { PropsWithChildren, useEffect, useState } from "react";

import { BrandMark } from "@/components/shared/brand-mark";

// Demo mode: Supabase auth is wired but workspaces and user tables are not yet
// deployed. Rather than blocking the entire demo with a hard redirect, we allow
// access and show a brief loading shimmer while the check runs.
// Switch REQUIRE_AUTH to true (and restore the full guard below) once Supabase
// tables are live and real user onboarding is in place.
const REQUIRE_AUTH = false;

export function WorkspaceAccessGuard({
  children,
}: PropsWithChildren<{ workspaceSlug: string }>) {
  const [ready, setReady] = useState(!REQUIRE_AUTH);

  // Brief shimmer on first paint so the app doesn't flash unstyled content
  useEffect(() => {
    if (!REQUIRE_AUTH) {
      setReady(true);
      return;
    }
    // Future: real auth check goes here when REQUIRE_AUTH = true
  }, []);

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
