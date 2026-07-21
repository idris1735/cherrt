import { describe, it, expect } from "vitest";
import {
  roleRank,
  canAssignRole,
  assignableRoles,
  foundingAdminRole,
  branchLeadRole,
} from "@/lib/services/identity/role-catalog";

describe("roleRank", () => {
  it("ranks org-level roles above branch roles above members", () => {
    expect(roleRank("senior_pastor")).toBeGreaterThan(roleRank("pastor"));
    expect(roleRank("pastor")).toBeGreaterThan(roleRank("finance"));
    expect(roleRank("finance")).toBeGreaterThan(roleRank("member"));
  });

  it("treats an unknown role as the lowest rank", () => {
    expect(roleRank("not-a-role")).toBe(0);
  });
});

describe("canAssignRole", () => {
  it("lets a senior pastor assign any catalog role", () => {
    expect(canAssignRole("senior_pastor", "finance")).toBe(true);
    expect(canAssignRole("senior_pastor", "pastor")).toBe(true);
    expect(canAssignRole("senior_pastor", "member")).toBe(true);
  });

  it("blocks privilege escalation — an actor cannot grant a role above their own", () => {
    expect(canAssignRole("pastor", "senior_pastor")).toBe(false);
    expect(canAssignRole("manager", "owner")).toBe(false);
  });

  it("lets an actor assign at or below their own rank", () => {
    expect(canAssignRole("pastor", "finance")).toBe(true);
    expect(canAssignRole("pastor", "pastor")).toBe(true);
  });

  it("blocks roles without assign authority entirely", () => {
    expect(canAssignRole("finance", "member")).toBe(false);
    expect(canAssignRole("secretary", "member")).toBe(false);
    expect(canAssignRole("member", "member")).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("offers church roles but never org-level seats", () => {
    const roles = assignableRoles("church");
    expect(roles).toContain("pastor");
    expect(roles).toContain("member");
    expect(roles).not.toContain("senior_pastor");
  });

  it("offers SME roles for the toolkit vertical", () => {
    expect(assignableRoles("toolkit")).toEqual(["manager", "finance", "staff"]);
  });
});

describe("founding + branch-lead roles by vertical", () => {
  it("seats a church founder as senior_pastor and others as owner", () => {
    expect(foundingAdminRole("church")).toBe("senior_pastor");
    expect(foundingAdminRole("toolkit")).toBe("owner");
  });

  it("seats a branch claimer as pastor for church, manager otherwise", () => {
    expect(branchLeadRole("church")).toBe("pastor");
    expect(branchLeadRole("store")).toBe("manager");
  });
});
