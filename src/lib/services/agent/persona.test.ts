import { describe, it, expect } from "vitest";
import { AGENT_PERSONA } from "@/lib/services/agent/persona";

// The persona carries safety-critical behaviour, not just tone. These lock in
// the non-negotiables so a future voice tweak can't silently drop them.
describe("AGENT_PERSONA", () => {
  it("is Chertt and speaks to a Nigerian church, English + Pidgin", () => {
    expect(AGENT_PERSONA).toMatch(/Chertt/);
    expect(AGENT_PERSONA).toMatch(/pidgin/i);
  });

  it("keeps the crisis-safety rules: don't counsel, escalate, give emergency help", () => {
    expect(AGENT_PERSONA).toMatch(/crisis/i);
    expect(AGENT_PERSONA).toMatch(/do not try to counsel/i);
    expect(AGENT_PERSONA).toMatch(/\b112\b/); // Nigeria emergency number
    expect(AGENT_PERSONA).toMatch(/pastoral-care tool/i);
  });

  it("keeps honesty and privacy rules", () => {
    expect(AGENT_PERSONA).toMatch(/never invent/i);
    expect(AGENT_PERSONA).toMatch(/never shared with anyone else|protect privacy/i);
  });

  it("keeps the confirmation rule for consequential actions", () => {
    expect(AGENT_PERSONA).toMatch(/confirm before/i);
  });

  it("is faith-comfortable but not preachy", () => {
    expect(AGENT_PERSONA).toMatch(/never preachy|never judge/i);
  });
});
