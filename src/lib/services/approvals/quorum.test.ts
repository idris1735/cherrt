import { describe, it, expect } from "vitest";
import { recordDecision, resolveQuorum } from "@/lib/services/approvals/quorum";

const at = "2026-08-15T00:00:00Z";

describe("recordDecision", () => {
  it("adds a decision once per approver — latest wins on replay", () => {
    const first = recordDecision([], "p1", "decline", at);
    expect(first).toHaveLength(1);
    const second = recordDecision(first, "p1", "approve", at);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ by: "p1", decision: "approve" });
  });

  it("keeps other approvers' decisions", () => {
    const d = recordDecision(recordDecision([], "p1", "approve", at), "p2", "decline", at);
    expect(d).toHaveLength(2);
  });
});

describe("resolveQuorum — any", () => {
  it("first approval decides", () => {
    expect(resolveQuorum("any", 1, 3, [{ by: "p1", decision: "approve", at }])).toBe("approved");
  });
  it("first decline decides", () => {
    expect(resolveQuorum("any", 1, 3, [{ by: "p2", decision: "decline", at }])).toBe("declined");
  });
  it("no decisions → open", () => {
    expect(resolveQuorum("any", 1, 3, [])).toBe("open");
  });
});

describe("resolveQuorum — n_of_m (2 of 3)", () => {
  it("stays open with one approval", () => {
    expect(resolveQuorum("n_of_m", 2, 3, [{ by: "p1", decision: "approve", at }])).toBe("open");
  });
  it("two approvals decide", () => {
    const d = recordDecision(recordDecision([], "p1", "approve", at), "p2", "approve", at);
    expect(resolveQuorum("n_of_m", 2, 3, d)).toBe("approved");
  });
  it("two declines make the requirement unreachable → declined", () => {
    const d = recordDecision(recordDecision([], "p1", "decline", at), "p2", "decline", at);
    expect(resolveQuorum("n_of_m", 2, 3, d)).toBe("declined");
  });
  it("one decline keeps it open (requirement still reachable)", () => {
    expect(resolveQuorum("n_of_m", 2, 3, [{ by: "p1", decision: "decline", at }])).toBe("open");
  });
});

describe("resolveQuorum — all (3 of 3)", () => {
  it("one decline kills it", () => {
    expect(resolveQuorum("all", 3, 3, [{ by: "p1", decision: "decline", at }])).toBe("declined");
  });
  it("two approvals are not enough", () => {
    const d = recordDecision(recordDecision([], "p1", "approve", at), "p2", "approve", at);
    expect(resolveQuorum("all", 3, 3, d)).toBe("open");
  });
  it("every approver approves → approved", () => {
    let d = recordDecision([], "p1", "approve", at);
    d = recordDecision(d, "p2", "approve", at);
    d = recordDecision(d, "p3", "approve", at);
    expect(resolveQuorum("all", 3, 3, d)).toBe("approved");
  });
});
