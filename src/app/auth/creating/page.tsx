import { ModuleCreationScreen } from "@/components/auth/module-creation-screen";
import type { ModuleKey } from "@/lib/types";

export default async function CreatingPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module } = await searchParams;
  const selectedModule = (module && ["toolkit", "church", "store", "events"].includes(module) ? module : "toolkit") as ModuleKey;

  return <ModuleCreationScreen selectedModule={selectedModule} />;
}
