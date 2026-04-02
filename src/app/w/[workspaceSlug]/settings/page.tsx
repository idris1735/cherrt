import { SectionHeading } from "@/components/shared/section-heading";
import { SurfaceCard } from "@/components/shared/surface-card";
import { listChannelAdapters } from "@/lib/services/channel-adapters";
import { getWorkspaceSnapshot } from "@/lib/services/workspace-service";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const snapshot = getWorkspaceSnapshot(workspaceSlug);
  const adapters = listChannelAdapters();

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="Settings and admin"
        title="Workspace identity, channels, and governance"
        body="The product is structured for multi-tenant SaaS now, with space for WhatsApp and deeper channel adapters later."
      />

      <div className="two-column-grid">
        <SurfaceCard>
          <SectionHeading eyebrow="Workspace" title={snapshot.workspace.legalName} />
          <div className="stack-list">
            <div className="record-card">
              <div>
                <strong>Primary operator</strong>
                <p>{snapshot.membership.email}</p>
              </div>
              <span>{snapshot.membership.role}</span>
            </div>
            <div className="record-card">
              <div>
                <strong>Modules</strong>
                <p>{snapshot.workspace.modules.join(", ")}</p>
              </div>
              <span>{snapshot.workspace.city}</span>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard tone="accent">
          <SectionHeading eyebrow="Channels" title="Adapter readiness" />
          <div className="stack-list">
            {adapters.map((adapter) => (
              <div className="record-card" key={adapter.id}>
                <div>
                  <strong>{adapter.label}</strong>
                  <p>{adapter.notes}</p>
                </div>
                <span>{adapter.shippingStatus}</span>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
