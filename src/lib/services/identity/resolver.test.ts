import { describe, it, expect } from "vitest";
import { pickActiveMembership, type BranchMembership } from "@/lib/services/identity/resolver";

function mem(workspaceId: string, role = "member"): BranchMembership {
  return { personId: "p1", workspaceId, workspaceName: workspaceId, role, unit: null };
}

describe("pickActiveMembership", () => {
  it("returns null when the person has no memberships", () => {
    expect(pickActiveMembership([])).toBeNull();
  });

  it("returns the only membership without needing an active context", () => {
    const m = mem("branch-a");
    expect(pickActiveMembership([m])).toBe(m);
  });

  it("returns null (ambiguous) when there are several and no active context", () => {
    expect(pickActiveMembership([mem("branch-a"), mem("branch-b")])).toBeNull();
  });

  it("uses the active workspace id to disambiguate when several exist", () => {
    const a = mem("branch-a");
    const b = mem("branch-b");
    expect(pickActiveMembership([a, b], "branch-b")).toBe(b);
  });

  it("falls back to ambiguous when the active workspace id matches none", () => {
    expect(pickActiveMembership([mem("branch-a"), mem("branch-b")], "branch-x")).toBeNull();
  });
});
