import type { Role } from "@/lib/types";

const capabilityAllowlistByRole: Partial<Record<Role, string[]>> = {
  finance: [
    "toolkit.requests-approvals",
    "toolkit.expense-logging",
    "toolkit.smart-documents",
  ],
  operations: [
    "toolkit.smart-documents",
    "toolkit.requests-approvals",
    "toolkit.inventory-management",
    "toolkit.issue-reporting",
    "toolkit.polls-feedback",
    "toolkit.expense-logging",
    "toolkit.simple-forms",
    "toolkit.appointments",
    "toolkit.faq",
    "toolkit.process-recall",
    "toolkit.staff-onboarding",
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

  // ── Identity-spine catalog roles (2026-07-21) ──
  // Church vertical. senior_pastor is allow-all (handled below with owner).
  pastor: [
    "church.giving",
    "church.first-timer",
    "church.prayer-request",
    "church.pastoral-care",
    "church.registration",
    "church.child-checkin",
  ],
  secretary: [
    "church.registration",
    "church.first-timer",
    "toolkit.smart-documents",
    "toolkit.appointments",
    "toolkit.staff-directory",
    "toolkit.faq",
  ],
  children: ["church.child-checkin"],
  dept_leader: [
    "church.registration",
    "toolkit.polls-feedback",
    "toolkit.requests-approvals",
    "toolkit.appointments",
  ],
  member: [
    "church.giving",
    "church.prayer-request",
    "church.first-timer",
    "church.registration",
    "events.registration",
    "events.rsvp-management",
    "store.order-capture",
  ],
  // SME/toolkit vertical. manager mirrors operations' broad toolkit access.
  manager: [
    "toolkit.smart-documents",
    "toolkit.requests-approvals",
    "toolkit.inventory-management",
    "toolkit.issue-reporting",
    "toolkit.polls-feedback",
    "toolkit.expense-logging",
    "toolkit.simple-forms",
    "toolkit.appointments",
    "toolkit.faq",
    "toolkit.process-recall",
    "toolkit.staff-onboarding",
    "toolkit.staff-directory",
  ],
  staff: [
    "toolkit.requests-approvals",
    "toolkit.expense-logging",
    "toolkit.issue-reporting",
    "toolkit.inventory-management",
  ],
};

export function evaluateCapabilityAccess(capabilityId: string, role: Role = "owner") {
  if (role === "owner" || role === "admin" || role === "approver" || role === "senior_pastor") {
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
