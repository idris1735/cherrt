import { ModuleTile } from "@/components/shared/module-tile";
import { SectionHeading } from "@/components/shared/section-heading";
import { SurfaceCard } from "@/components/shared/surface-card";
import { getModuleHealth, getWorkspaceSnapshot } from "@/lib/services/workspace-service";

export default async function ModulesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const snapshot = getWorkspaceSnapshot(workspaceSlug);
  const modules = getModuleHealth(snapshot);

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Solution modules"
        title="One foundation, four focused product faces"
        body="Every module feels native to its audience, but all of them share the same records, approvals, notifications, and AI action system."
      />
      <div className="modules-grid">
        {modules.map((module) => (
          <ModuleTile
            key={module.key}
            workspaceSlug={workspaceSlug}
            module={module.key}
            description={module.description}
            count={module.count}
          />
        ))}
      </div>

      <SurfaceCard tone="ink">
        <SectionHeading
          eyebrow="Platform principle"
          title="Chertt is not a generic dashboard with four tabs"
          body="The module system is intentionally narrative: every area has its own mood, but the same operational backbone."
        />
      </SurfaceCard>
    </div>
  );
}
