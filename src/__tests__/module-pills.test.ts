import { describe, it, expect } from "vitest";

const MODULE_SUGGESTION_CARDS = {
  toolkit: [
    { label: "Draft letter",        hint: "Create and route for signature" },
    { label: "Raise request",       hint: "Expenses, supplies, repairs" },
    { label: "Report issue",        hint: "Facility or security incident" },
    { label: "Log expense",         hint: "Record petty cash or receipt" },
  ],
  church: [
    { label: "Record giving",       hint: "Tithes, offerings, donations" },
    { label: "Log prayer request",  hint: "Capture pastoral need" },
    { label: "Register first timer",hint: "New visitor workflow" },
    { label: "Pastoral care",       hint: "Care visit or follow-up" },
  ],
  store: [
    { label: "Capture order",       hint: "New customer order" },
    { label: "Add product",         hint: "Add to your catalogue" },
    { label: "Create invoice",      hint: "Bill a client" },
    { label: "Check stock",         hint: "View inventory levels" },
  ],
  events: [
    { label: "Register guest",      hint: "Add RSVP or attendee" },
    { label: "Issue ticket",        hint: "Generate event ticket" },
    { label: "Send invites",        hint: "Invite guests to an event" },
    { label: "Manage RSVP",         hint: "Review guest list" },
  ],
} as const;

describe("MODULE_SUGGESTION_CARDS", () => {
  it("has 4 cards for every module", () => {
    for (const key of ["toolkit", "church", "store", "events"] as const) {
      expect(MODULE_SUGGESTION_CARDS[key]).toHaveLength(4);
    }
  });

  it("toolkit first card is Draft letter", () => {
    expect(MODULE_SUGGESTION_CARDS.toolkit[0].label).toBe("Draft letter");
  });

  it("store first card is Capture order", () => {
    expect(MODULE_SUGGESTION_CARDS.store[0].label).toBe("Capture order");
  });
});
