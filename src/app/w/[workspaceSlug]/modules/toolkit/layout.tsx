import type { ReactNode } from "react";

import { ToolkitShell } from "@/components/toolkit/toolkit-shell";

export default async function ToolkitLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <ToolkitShell workspaceSlug={workspaceSlug}>{children}</ToolkitShell>;
}
