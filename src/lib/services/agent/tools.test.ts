import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/services/whatsapp-workspace", () => ({
  getGivingSummary: vi.fn(),
  loadWorkspaceContext: vi.fn(),
}));
vi.mock("@/lib/services/identity/provisioning", () => ({
  listBranchMembers: vi.fn(),
}));

import { getGivingSummary, loadWorkspaceContext } from "@/lib/services/whatsapp-workspace";
import { listBranchMembers } from "@/lib/services/identity/provisioning";
import { READ_TOOLS, getReadTool, type AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "branch-a", role: "owner" };

describe("READ_TOOLS registry", () => {
  it("every tool has a unique name, a description, and object parameters", () => {
    const names = new Set<string>();
    for (const t of READ_TOOLS) {
      expect(t.name).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.parameters.type).toBe("object");
      expect(names.has(t.name)).toBe(false);
      names.add(t.name);
    }
  });

  it("getReadTool finds a tool by name and returns undefined otherwise", () => {
    expect(getReadTool("get_giving_summary")?.name).toBe("get_giving_summary");
    expect(getReadTool("nope")).toBeUndefined();
  });
});

describe("read tool handlers are workspace-scoped and shape their output", () => {
  it("get_giving_summary passes the ctx workspace and returns the totals", async () => {
    vi.mocked(getGivingSummary).mockResolvedValueOnce({
      totalThisMonth: 300000,
      totalLastMonth: 200000,
      countThisMonth: 8,
      byType: { tithe: 300000 },
      recent: [],
    });
    const out = (await getReadTool("get_giving_summary")!.handler({}, ctx)) as { totalThisMonth: number };
    expect(getGivingSummary).toHaveBeenCalledWith("branch-a");
    expect(out.totalThisMonth).toBe(300000);
  });

  it("get_pending_requests reads workspace context and counts", async () => {
    vi.mocked(loadWorkspaceContext).mockResolvedValueOnce({
      pendingRequests: [{ id: "r1", title: "Chairs", amount: 5000, requester: "Ruth" }],
      recentExpenses: [],
      lowInventoryItems: [],
      pendingIssues: [],
      givingCategories: [],
      ministryUnits: [],
    });
    const out = (await getReadTool("get_pending_requests")!.handler({}, ctx)) as { count: number };
    expect(loadWorkspaceContext).toHaveBeenCalledWith("branch-a");
    expect(out.count).toBe(1);
  });

  it("list_members reads branch members", async () => {
    vi.mocked(listBranchMembers).mockResolvedValueOnce([
      { personId: "p1", fullName: "Ruth", role: "member" },
    ]);
    const out = (await getReadTool("list_members")!.handler({}, ctx)) as { count: number };
    expect(listBranchMembers).toHaveBeenCalledWith("branch-a");
    expect(out.count).toBe(1);
  });
});
