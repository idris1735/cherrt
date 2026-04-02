import Link from "next/link";

import type { ModuleKey } from "@/lib/types";

const moduleLabel: Record<ModuleKey, string> = {
  toolkit: "Business Toolkit",
  church: "ChurchBase",
  store: "StoreFront",
  events: "Events",
};

export function ModuleTile({
  workspaceSlug,
  module,
  description,
  count,
}: {
  workspaceSlug: string;
  module: ModuleKey;
  description: string;
  count: number;
}) {
  return (
    <Link className="module-tile" href={`/w/${workspaceSlug}/modules/${module}`}>
      <div className="module-tile__badge">{moduleLabel[module]}</div>
      <h3>{moduleLabel[module]}</h3>
      <p>{description}</p>
      <span>{count} active surfaces</span>
    </Link>
  );
}
