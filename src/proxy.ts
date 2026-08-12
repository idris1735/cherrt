import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The /w workspace surface was deleted (2026-08-12 web rebuild).
// This middleware now passes through — kept as a no-op in case the
// config.matcher is still referenced by Next.js routing.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [], // no routes — dead surface
};

