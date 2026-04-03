import type { Role } from "@/lib/types";

const capabilityAllowlistByRole: Partial<Record<Role, string[]>> = {
  finance: [
    "toolkit.requests-approvals",
    "toolkit.expense-logging",
    "toolkit.smart-documents",
  ],
  operations: [
    "toolkit.requests-approvals",
    "toolkit.inventory-management",
    "toolkit.issue-reporting",
    "toolkit.expense-logging",
    "toolkit.simple-forms",
    "toolkit.appointments",
    "toolkit.process-recall",
    "toolkit.staff-directory",
  ],
  pastoral: [
    "church.giving",
    "church.first-timer",
    "church.prayer-request",
    "church.pastoral-care",
    "church.registration",
  ],
  "store-manager": [
    "store.catalog",
    "store.order-capture",
    "store.invoicing-receipts",
    "store.payment-collection",
    "store.stock-tracking",
    "store.order-management",
  ],
  "event-manager": [
    "events.registration",
    "events.ticketing",
    "events.invites-reminders",
    "events.rsvp-management",
    "events.guest-checkin",
  ],
};

export function evaluateCapabilityAccess(capabilityId: string, role: Role = "owner") {
  if (role === "owner" || role === "admin" || role === "approver") {
    return { allowed: true as const };
  }

  const allowlist = capabilityAllowlistByRole[role] ?? [];
  if (allowlist.includes(capabilityId)) {
    return { allowed: true as const };
  }

  return {
    allowed: false as const,
    reason: `Your current role (${role}) does not have permission to execute this action.`,
  };
}

