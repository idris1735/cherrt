import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";

// Mock the DB-backed layers so the flow's state machine can be exercised purely.
vi.mock("@/lib/services/whatsapp-session", () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/identity/provisioning", () => ({
  listBranchMembers: vi.fn(),
  setMembershipRole: vi.fn(),
}));

import { updateSession } from "@/lib/services/whatsapp-session";
import { listBranchMembers, setMembershipRole } from "@/lib/services/identity/provisioning";
import {
  isAssignRoleTrigger,
  startAssignRoleFlow,
  advanceAssignRoleFlow,
} from "@/lib/services/identity/assign-role-flow";

const PHONE = "2348012345678";

function sessionWith(onboarding: WhatsAppSession["onboarding"]): WhatsAppSession {
  return { phoneNumber: PHONE, welcomed: true, demoBalance: 0, onboarding, history: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isAssignRoleTrigger", () => {
  it("matches role-management phrasings", () => {
    expect(isAssignRoleTrigger("assign a role")).toBe(true);
    expect(isAssignRoleTrigger("change someone's role")).toBe(true);
    expect(isAssignRoleTrigger("manage roles")).toBe(true);
  });
  it("ignores unrelated messages", () => {
    expect(isAssignRoleTrigger("what's my giving this month")).toBe(false);
  });
});

describe("startAssignRoleFlow", () => {
  it("lists reassignable members for an authorized actor", async () => {
    vi.mocked(listBranchMembers).mockResolvedValueOnce([
      { personId: "p1", fullName: "Ruth A", role: "member" },
      { personId: "p2", fullName: "John B", role: "finance" },
    ]);
    const reply = await startAssignRoleFlow(PHONE, "branch-a", "senior_pastor");
    expect(reply).toContain("Ruth A");
    expect(reply).toContain("John B");
    expect(updateSession).toHaveBeenCalledOnce();
  });

  it("excludes members whose role outranks the actor", async () => {
    vi.mocked(listBranchMembers).mockResolvedValueOnce([
      { personId: "p1", fullName: "Ruth A", role: "member" },
      { personId: "p9", fullName: "Big Boss", role: "senior_pastor" },
    ]);
    // a pastor can reassign the member but not the senior_pastor
    const reply = await startAssignRoleFlow(PHONE, "branch-a", "pastor");
    expect(reply).toContain("Ruth A");
    expect(reply).not.toContain("Big Boss");
  });

  it("refuses an actor with no assign authority", async () => {
    const reply = await startAssignRoleFlow(PHONE, "branch-a", "member");
    expect(reply).toMatch(/permission/i);
    expect(listBranchMembers).not.toHaveBeenCalled();
  });
});

describe("advanceAssignRoleFlow", () => {
  const baseCollected = {
    workspaceId: "branch-a",
    actorRole: "senior_pastor",
    candidates: [{ personId: "p1", fullName: "Ruth A", role: "member" }],
    roleOptions: ["pastor", "finance", "member"],
  };

  it("walks pick_member → pick_role → confirm → applies the change", async () => {
    // pick member #1
    let reply = await advanceAssignRoleFlow(
      PHONE,
      sessionWith({ flow: "assign-role", step: "pick_member", collected: baseCollected }),
      "1",
    );
    expect(reply).toContain("What role");

    // pick role #2 (finance)
    reply = await advanceAssignRoleFlow(
      PHONE,
      sessionWith({
        flow: "assign-role",
        step: "pick_role",
        collected: { ...baseCollected, targetPersonId: "p1", targetName: "Ruth A" },
      }),
      "2",
    );
    expect(reply).toContain("finance");

    // confirm
    vi.mocked(setMembershipRole).mockResolvedValueOnce(true);
    reply = await advanceAssignRoleFlow(
      PHONE,
      sessionWith({
        flow: "assign-role",
        step: "confirm",
        collected: { ...baseCollected, targetPersonId: "p1", targetName: "Ruth A", chosenRole: "finance" },
      }),
      "yes",
    );
    expect(setMembershipRole).toHaveBeenCalledWith("p1", "branch-a", "finance");
    expect(reply).toContain("now finance");
  });

  it("reprompts on an out-of-range member number", async () => {
    const reply = await advanceAssignRoleFlow(
      PHONE,
      sessionWith({ flow: "assign-role", step: "pick_member", collected: baseCollected }),
      "9",
    );
    expect(reply).toMatch(/number from the list/i);
    expect(setMembershipRole).not.toHaveBeenCalled();
  });

  it("cancels cleanly at any step", async () => {
    const reply = await advanceAssignRoleFlow(
      PHONE,
      sessionWith({ flow: "assign-role", step: "pick_member", collected: baseCollected }),
      "cancel",
    );
    expect(reply).toMatch(/no change/i);
    expect(updateSession).toHaveBeenCalledWith(PHONE, { onboarding: undefined });
  });
});
