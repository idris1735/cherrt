import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceData } from "@/lib/services/workspace-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const { workspaceSlug } = await params;

  // Resolve workspace ID from slug (for demo, use the slug directly;
  // in production this would query the workspaces table).
  // For the fallback case, loadWorkspaceData handles non-UUID slugs gracefully.
  try {
    const data = await loadWorkspaceData(workspaceSlug);
    return NextResponse.json(data);
  } catch {
    const { getDemoWorkspaceData } = await import("@/lib/data/demo-workspace");
    return NextResponse.json(getDemoWorkspaceData());
  }
}
