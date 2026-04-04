import type { ModuleKey } from "@/lib/types";

export const toolkitFaqTopics = [
  "How do staff request office supplies?",
  "Who approves repairs and urgent maintenance?",
  "Where can we find payment and compliance documents?",
  "How are petty cash receipts handed over to accounts?",
];

export const toolkitProcessDocuments = [
  "Emergency spending procedure",
  "Vehicle documents register",
  "Vendor onboarding checklist",
  "Front desk escalation process",
];

export const toolkitOnboardingChecklist = [
  "Create staff profile and directory card",
  "Attach policy and starter links",
  "Assign onboarding owner and department",
  "Schedule first-week orientation appointment",
];

export function getModuleBaseHref(workspaceSlug: string, module: ModuleKey) {
  return `/w/${workspaceSlug}/modules/${module}`;
}
