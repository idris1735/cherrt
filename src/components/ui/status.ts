import type { WorkflowStatus } from "@/lib/types";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export function statusTone(status: WorkflowStatus): BadgeTone {
  switch (status) {
    case "approved":
    case "completed":
      return "success";
    case "pending":
      return "warning";
    case "flagged":
      return "danger";
    case "in-progress":
      return "info";
    case "draft":
    default:
      return "neutral";
  }
}

export function statusLabel(status: WorkflowStatus): string {
  switch (status) {
    case "in-progress":
      return "In progress";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
