import { describe, it, expect } from "vitest";
import { AGENT_PERSONA, GUEST_PERSONA, composeSystemPrompt, buildIdentityBlock, roleLabel } from "@/lib/services/agent/persona";

// The persona carries safety-critical behaviour, not just tone. These lock in
// the non-negotiables so a future voice tweak can't silently drop them.
describe("AGENT_PERSONA", () => {
  it("is Chertt, human (not AI-ish), Nigerian, English + Pidgin", () => {
    expect(AGENT_PERSONA).toMatch(/Chertt/);
    expect(AGENT_PERSONA).toMatch(/pidgin/i);
    expect(AGENT_PERSONA).toMatch(/not a bot|not an? .?AI|sound human/i);
  });

  it("knows the product and nudges engagement (marketer warmth)", () => {
    expect(AGENT_PERSONA).toMatch(/nudge people toward more|save you a seat|choir/i);
  });

  it("keeps the crisis-safety rules: don't counsel, escalate, emergency help", () => {
    expect(AGENT_PERSONA).toMatch(/crisis/i);
    expect(AGENT_PERSONA).toMatch(/do not counsel/i);
    expect(AGENT_PERSONA).toMatch(/\b112\b/);
    expect(AGENT_PERSONA).toMatch(/pastoral-care tool/i);
  });

  it("keeps honesty and privacy rules", () => {
    expect(AGENT_PERSONA).toMatch(/never invent/i);
    expect(AGENT_PERSONA).toMatch(/keep secrets|nobody else/i);
  });

  it("keeps the confirmation rule and stays non-preachy", () => {
    expect(AGENT_PERSONA).toMatch(/confirm before/i);
    expect(AGENT_PERSONA).toMatch(/never preachy|holier-than-thou/i);
  });
});

describe("WhatsApp formatting + role guidance", () => {
  it("tells the agent to answer role/menu questions about the person, not itself", () => {
    expect(AGENT_PERSONA).toMatch(/answer about \*them\*/i);
    expect(AGENT_PERSONA).toMatch(/never recite a long capability list/i);
  });

  it("bans Markdown that breaks in WhatsApp", () => {
    expect(AGENT_PERSONA).toMatch(/one\* asterisk|single asterisk|one asterisk/i);
    expect(AGENT_PERSONA).toMatch(/double asterisks|Markdown/i);
  });
});

describe("roleLabel", () => {
  it("humanises known slugs and defaults unknown ones to member", () => {
    expect(roleLabel("senior_pastor")).toBe("the senior pastor");
    expect(roleLabel("finance")).toBe("on the finance team");
    expect(roleLabel("who_knows")).toBe("a member");
    expect(roleLabel(null)).toBe("a member");
  });
});

describe("buildIdentityBlock", () => {
  it("names the person, their role and church, and tells the agent to answer about THEM", () => {
    const out = buildIdentityBlock("Idris", "senior_pastor", "Grace Chapel (Demo)");
    expect(out).toContain("*Idris*");
    expect(out).toContain("the senior pastor");
    expect(out).toContain("Grace Chapel (Demo)");
    expect(out).toMatch(/answer about THEM/);
    expect(out).toMatch(/never describe yourself/i);
  });

  it("gives leaders the oversight capabilities and members the member set", () => {
    expect(buildIdentityBlock("Sam", "senior_pastor", "X")).toMatch(/approve pending requests|announcements|reports/i);
    const member = buildIdentityBlock("Ada", "member", "X");
    expect(member).toMatch(/As a member they can give/);
    expect(member).not.toMatch(/manage people and roles/);
  });

  it("handles a missing name and church gracefully", () => {
    const out = buildIdentityBlock("", "member", "");
    expect(out).toContain("this person");
    expect(out).not.toContain(" at *");
  });
});

describe("GUEST_PERSONA", () => {
  it("is church-focused and guides onboarding — never the old SME framing", () => {
    expect(GUEST_PERSONA).toMatch(/Chertt/);
    expect(GUEST_PERSONA).toMatch(/church/i);
    expect(GUEST_PERSONA).toMatch(/set up my church/i);
    // it explicitly forbids the old SME framing (so the words appear in a
    // "never mention" instruction — that's intended, not a leak)
    expect(GUEST_PERSONA).toMatch(/never mention[^.]*module/i);
  });
});

describe("composeSystemPrompt", () => {
  it("returns just the base + memory when no church persona is set", () => {
    const out = composeSystemPrompt(null, "\n\n[memory here]");
    expect(out).toContain("Chertt");
    expect(out).toContain("[memory here]");
    expect(out).not.toContain("This church's own flavour");
  });

  it("layers a church's custom flavour on top of the base (safety still first)", () => {
    const out = composeSystemPrompt("Talk like a hype MC, lots of Pidgin", "");
    expect(out).toContain("This church's own flavour");
    expect(out).toContain("hype MC");
    // base + its rules still present and precede the church note
    expect(out.indexOf("Do NOT counsel")).toBeLessThan(out.indexOf("hype MC"));
  });

  it("ignores blank/whitespace church personas", () => {
    expect(composeSystemPrompt("   ", "")).not.toContain("This church's own flavour");
  });
});
