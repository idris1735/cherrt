import type { ModuleKey } from "@/lib/types";

export type CapabilityStatus = "live" | "planned";

export type CapabilityDefinition = {
  id: string;
  module: ModuleKey;
  title: string;
  status: CapabilityStatus;
  keywords: string[];
};

export const capabilityCatalog: CapabilityDefinition[] = [
  {
    id: "toolkit.smart-documents",
    module: "toolkit",
    title: "Smart documents",
    status: "live",
    keywords: ["draft", "letter", "invoice", "memo", "document", "signature", "sign"],
  },
  {
    id: "toolkit.requests-approvals",
    module: "toolkit",
    title: "Requests and approvals",
    status: "live",
    keywords: ["request", "approval", "approve", "purchase", "supplies", "raise"],
  },
  {
    id: "toolkit.inventory-management",
    module: "toolkit",
    title: "Inventory management",
    status: "live",
    keywords: ["inventory", "stock", "reorder", "store", "in stock", "restock"],
  },
  {
    id: "toolkit.issue-reporting",
    module: "toolkit",
    title: "Issue and facility reporting",
    status: "live",
    keywords: ["issue", "facility", "incident", "repair", "broken", "security report"],
  },
  {
    id: "toolkit.polls-feedback",
    module: "toolkit",
    title: "Polls, surveys, and feedback",
    status: "live",
    keywords: ["poll", "survey", "feedback", "approve copy", "approval poll"],
  },
  {
    id: "toolkit.expense-logging",
    module: "toolkit",
    title: "Petty cash and expense logging",
    status: "live",
    keywords: ["expense", "petty cash", "receipt", "fuel", "diesel", "log expense"],
  },
  {
    id: "toolkit.simple-forms",
    module: "toolkit",
    title: "Simple forms",
    status: "live",
    keywords: ["form", "questionnaire", "collect response", "submission"],
  },
  {
    id: "toolkit.appointments",
    module: "toolkit",
    title: "Appointments",
    status: "live",
    keywords: ["appointment", "schedule", "meeting", "calendar", "book time"],
  },
  {
    id: "toolkit.faq",
    module: "toolkit",
    title: "FAQs",
    status: "live",
    keywords: ["faq", "question", "how do we", "what is the process"],
  },
  {
    id: "toolkit.process-recall",
    module: "toolkit",
    title: "Process recall",
    status: "live",
    keywords: ["process", "policy", "procedure", "knowledge", "operations document"],
  },
  {
    id: "toolkit.staff-onboarding",
    module: "toolkit",
    title: "Staff onboarding",
    status: "live",
    keywords: ["onboarding", "new staff", "starter checklist", "induction"],
  },
  {
    id: "toolkit.staff-directory",
    module: "toolkit",
    title: "Staff directory",
    status: "live",
    keywords: ["directory", "staff profile", "contact", "phone", "who is"],
  },
  {
    id: "church.child-checkin",
    module: "church",
    title: "Sunday child check-in",
    status: "planned",
    keywords: ["child check-in", "children check in", "kids checkin"],
  },
  {
    id: "church.giving",
    module: "church",
    title: "Giving",
    status: "planned",
    keywords: ["giving", "offering", "tithe", "donation"],
  },
  {
    id: "church.registration",
    module: "church",
    title: "Church registration",
    status: "planned",
    keywords: ["conference registration", "church registration", "register attendee"],
  },
  {
    id: "church.first-timer",
    module: "church",
    title: "First timer capture",
    status: "planned",
    keywords: ["first timer", "new guest", "visitor capture"],
  },
  {
    id: "church.prayer-request",
    module: "church",
    title: "Prayer requests",
    status: "planned",
    keywords: ["prayer request", "prayer", "intercession"],
  },
  {
    id: "church.pastoral-care",
    module: "church",
    title: "Pastoral care requests",
    status: "planned",
    keywords: ["pastoral care", "care request", "pastor visit"],
  },
  {
    id: "store.catalog",
    module: "store",
    title: "Catalog",
    status: "planned",
    keywords: ["catalog", "product list", "product"],
  },
  {
    id: "store.order-capture",
    module: "store",
    title: "Order capture",
    status: "planned",
    keywords: ["order", "place order", "capture order"],
  },
  {
    id: "store.invoicing-receipts",
    module: "store",
    title: "Invoicing and receipts",
    status: "planned",
    keywords: ["receipt", "issue invoice", "store invoice"],
  },
  {
    id: "store.payment-collection",
    module: "store",
    title: "Payment collection",
    status: "planned",
    keywords: ["payment link", "collect payment", "checkout link"],
  },
  {
    id: "store.stock-tracking",
    module: "store",
    title: "Stock tracking",
    status: "planned",
    keywords: ["stock level", "stock tracking", "available stock"],
  },
  {
    id: "store.order-management",
    module: "store",
    title: "Order management",
    status: "planned",
    keywords: ["delivery code", "order status", "fulfillment"],
  },
  {
    id: "events.registration",
    module: "events",
    title: "Events registration",
    status: "planned",
    keywords: ["event registration", "register guest", "attendee registration"],
  },
  {
    id: "events.ticketing",
    module: "events",
    title: "Ticketing",
    status: "planned",
    keywords: ["ticket", "issue ticket", "paid ticket", "free ticket"],
  },
  {
    id: "events.invites-reminders",
    module: "events",
    title: "Invitations and reminders",
    status: "planned",
    keywords: ["invite", "invitation", "send reminder", "guest reminder"],
  },
  {
    id: "events.rsvp-management",
    module: "events",
    title: "RSVP management",
    status: "planned",
    keywords: ["rsvp", "guest response", "attendance confirmation"],
  },
  {
    id: "events.guest-checkin",
    module: "events",
    title: "Guest check-in",
    status: "planned",
    keywords: ["qr checkin", "guest checkin", "access control", "scan code"],
  },
];

const defaultCapability = capabilityCatalog[0];

export function getDefaultCapability() {
  return defaultCapability;
}

export function getCapabilityById(capabilityId: string) {
  return capabilityCatalog.find((capability) => capability.id === capabilityId) ?? defaultCapability;
}

