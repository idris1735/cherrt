import { WorkspaceAccessGuard } from "@/components/auth/workspace-access-guard";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { AppStateProvider } from "@/components/providers/app-state-provider";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { getWorkspaceSnapshot } from "@/lib/services/workspace-service";
import type { ReactNode } from "react";

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}>) {
  const { workspaceSlug } = await params;
  const snapshot = getWorkspaceSnapshot(workspaceSlug);

  return (
    <AppStateProvider initialSnapshot={snapshot}>
      <AssistantProvider>
        <WorkspaceAccessGuard workspaceSlug={workspaceSlug}>
          <WorkspaceShell workspaceSlug={workspaceSlug} workspace={snapshot.workspace} membership={snapshot.membership}>
            {children}
          </WorkspaceShell>
        </WorkspaceAccessGuard>
      </AssistantProvider>
    </AppStateProvider>
  );
}
