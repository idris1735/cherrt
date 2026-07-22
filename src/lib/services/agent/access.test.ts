import { describe, it, expect } from "vitest";
import { toolAccessError } from "@/lib/services/agent/access";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { AgentContext, AgentTool } from "@/lib/services/agent/tools";

function fakeTool(minRank?: number): AgentTool {
  return { name: "t", description: "d", parameters: { type: "object", properties: {} }, minRank, handler: async () => ({}) };
}
const ctx = (role: string): AgentContext => ({ workspaceId: "ws1", role: role as AgentContext["role"] });

describe("toolAccessError", () => {
  it("allows any member when the tool has no minRank", () => {
    expect(toolAccessError(fakeTool(undefined), ctx("member"))).toBeNull();
  });

  it("denies a member a finance-gated tool and allows finance+", () => {
    expect(toolAccessError(fakeTool(3), ctx("member"))).toMatch(/permission/i);
    expect(toolAccessError(fakeTool(3), ctx("finance"))).toBeNull();
    expect(toolAccessError(fakeTool(3), ctx("senior_pastor"))).toBeNull();
  });

  it("fails closed for an unknown role (ranks as 0)", () => {
    expect(toolAccessError(fakeTool(1), ctx("not-a-real-role"))).toMatch(/permission/i);
  });
});

describe("critical per-tool gating (locks the security decisions)", () => {
  const rankOf = (name: string) => getAgentTool(name)?.minRank;

  it("gates the financial ledger writes to finance", () => {
    expect(rankOf("record_giving")).toBe(3); // finance records received giving
    expect(rankOf("log_expense")).toBe(3);
  });

  it("lets a member give their OWN money (give_now is ungated)", () => {
    expect(rankOf("give_now")).toBeUndefined();
    expect(getAgentTool("give_now")?.mutates).toBe(true);
  });

  it("gates rosters, PII and sensitive lists", () => {
    expect(rankOf("list_members")).toBe(2);
    expect(rankOf("list_first_timers")).toBe(2);
    expect(rankOf("get_giving_summary")).toBe(3);
    expect(rankOf("list_prayer_requests")).toBe(4);
    expect(rankOf("list_life_journeys")).toBe(4);
  });

  it("restricts child pickup/release to volunteers/leaders but lets parents check in", () => {
    expect(rankOf("lookup_child_pickup")).toBe(1);
    expect(rankOf("release_child")).toBe(1);
    expect(rankOf("check_in_child")).toBeUndefined();
  });

  it("keeps member self-service and public reads open", () => {
    expect(rankOf("capture_prayer_request")).toBeUndefined();
    expect(rankOf("request_pastoral_care")).toBeUndefined();
    expect(rankOf("register_for_event")).toBeUndefined();
    expect(rankOf("join_department")).toBeUndefined();
    expect(rankOf("list_events")).toBeUndefined();
    expect(rankOf("list_departments")).toBeUndefined();
  });

  it("gates announcements to admins/pastors", () => {
    expect(rankOf("create_announcement")).toBe(4);
  });
});
