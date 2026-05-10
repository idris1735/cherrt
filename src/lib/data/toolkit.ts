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

export type OnboardingStep = {
  id: string;
  label: string;
  description: string;
  category: "Setup" | "Documents" | "Tools" | "Orientation" | "Review";
};

export const toolkitOnboardingChecklist: OnboardingStep[] = [
  { id: "profile", label: "Create staff profile", description: "Add to staff directory with name, role, unit, and phone number.", category: "Setup" },
  { id: "credentials", label: "Issue ID and access", description: "Physical ID card, building access, and system login credentials.", category: "Setup" },
  { id: "handbook", label: "Share staff handbook", description: "Send policy documents, company handbook, and key process guides.", category: "Documents" },
  { id: "hr-form", label: "Complete HR and payroll form", description: "Emergency contacts, tax form, and bank details for payroll.", category: "Documents" },
  { id: "email", label: "Set up work tools", description: "Work email, communication apps, and required software access.", category: "Tools" },
  { id: "workspace", label: "Assign workspace and equipment", description: "Desk, laptop, phone, and any role-specific equipment.", category: "Tools" },
  { id: "orientation", label: "Schedule orientation session", description: "First formal meeting covering culture, structure, and expectations.", category: "Orientation" },
  { id: "introductions", label: "Introduce to team and manager", description: "Formal introduction to direct line manager and immediate team.", category: "Orientation" },
  { id: "training", label: "Complete role-specific training", description: "Any training, shadowing, or briefing required for the job function.", category: "Review" },
  { id: "probation", label: "Set probation and review date", description: "Agree on probation length and schedule the first formal review.", category: "Review" },
];

export function getModuleBaseHref(workspaceSlug: string, module: ModuleKey) {
  return `/w/${workspaceSlug}/modules/${module}`;
}
