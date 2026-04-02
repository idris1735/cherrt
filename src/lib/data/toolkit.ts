import type { ModuleKey } from "@/lib/types";

export const toolkitMenuItems = [
  { href: "", label: "Home", shortLabel: "Home" },
  { href: "/chat", label: "Command", shortLabel: "Ask" },
  { href: "/requests", label: "Requests", shortLabel: "Work" },
  { href: "/documents", label: "Documents", shortLabel: "Docs" },
  { href: "/inventory", label: "Inventory", shortLabel: "Stock" },
  { href: "/issues", label: "Issues", shortLabel: "Issues" },
  { href: "/expenses", label: "Expenses", shortLabel: "Cash" },
  { href: "/directory", label: "Directory", shortLabel: "People" },
] as const;

export const toolkitQuickPrompts = [
  "Draft a letter on our letterhead and route it for signature.",
  "Raise an expense request for diesel and send it to Finance.",
  "Report a broken AC in the executive meeting room.",
  "Find the process note for supplier payment and share it.",
  "Show me Taylor Brooks in the staff directory.",
  "Create an appointment for vendor document sign-off tomorrow.",
];

export const toolkitTemplateNotes = [
  "Letterhead-ready letters and memos",
  "Invoice drafts with approval routing",
  "Expense requests with finance-first review",
  "Facility issue reports with media evidence",
];

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

export const toolkitCapabilityLabels = [
  "AI Command / Chat",
  "Requests & Approvals",
  "Smart Documents",
  "Inventory",
  "Issue Reporting",
  "Petty Cash",
  "Simple Forms",
  "Appointments",
  "FAQs / Process Docs",
  "Staff Onboarding",
  "Staff Directory",
];

export function getModuleBaseHref(workspaceSlug: string, module: ModuleKey) {
  return `/w/${workspaceSlug}/modules/${module}`;
}
