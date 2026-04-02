import { SetupForm } from "@/components/auth/setup-form";
import type { ModuleKey } from "@/lib/types";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module } = await searchParams;
  const selectedModule = (module && ["toolkit", "church", "store", "events"].includes(module) ? module : "toolkit") as ModuleKey;

  return <SetupForm selectedModule={selectedModule} />;
}
