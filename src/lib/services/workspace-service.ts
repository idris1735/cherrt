import { cloneSnapshot } from "@/lib/data/seed";
import type { ModuleKey, WorkspaceSnapshot } from "@/lib/types";

export function getWorkspaceSnapshot(workspaceSlug: string): WorkspaceSnapshot {
  const snapshot = cloneSnapshot();
  if (workspaceSlug !== snapshot.workspace.slug) {
    return {
      ...snapshot,
      workspace: {
        ...snapshot.workspace,
        slug: workspaceSlug,
        name: workspaceSlug
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
      },
    };
  }
  return snapshot;
}

export function getModuleHealth(snapshot: WorkspaceSnapshot) {
  const requestCounts: Record<ModuleKey, number> = {
    toolkit: 0,
    church: 0,
    store: 0,
    events: 0,
  };

  snapshot.requests.forEach((request) => {
    requestCounts[request.module] += 1;
  });

  return [
    {
      key: "toolkit" as const,
      label: "Business Toolkit",
      count: requestCounts.toolkit + snapshot.documents.length + snapshot.issues.length,
      description: "Documents, approvals, inventory, reporting, and operations memory.",
    },
    {
      key: "church" as const,
      label: "ChurchBase",
      count: snapshot.giving.length + snapshot.careRequests.length + 1,
      description: "Member-facing care, child check-in, giving, and registration.",
    },
    {
      key: "store" as const,
      label: "StoreFront",
      count: snapshot.orders.length + snapshot.products.length + snapshot.invoices.length,
      description: "Catalogs, payment links, invoices, receipts, and stock tracking.",
    },
    {
      key: "events" as const,
      label: "Events",
      count: snapshot.events.length + snapshot.registrations.length + snapshot.checkIns.length,
      description: "RSVP, tickets, invitations, and guest access control.",
    },
  ];
}
