import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentContext } from "@/lib/services/agent/tools";

const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
// Known read tools with their minRank; anything else → undefined (row hidden).
const RANKS: Record<string, number> = { list_events: 0, list_birthdays: 2, get_giving_summary: 3, list_prayer_requests: 4 };
vi.mock("@/lib/services/agent/runtime", () => ({
  getAgentTool: (name: string) =>
    name in RANKS ? { name, description: "", parameters: { type: "object", properties: {} }, minRank: RANKS[name], handler: handlerMock } : undefined,
}));

import { runMenuRead } from "@/lib/services/agent/read-menu";

const ctx = (role: string): AgentContext => ({ workspaceId: "ws1", role } as AgentContext);
beforeEach(() => vi.clearAllMocks());

describe("runMenuRead", () => {
  it("returns null for non-read rows (falls through to the agent)", async () => {
    expect(await runMenuRead("menu:give", ctx("member"))).toBeNull();
    expect(await runMenuRead("switch:ws2", ctx("member"))).toBeNull();
    expect(await runMenuRead("menu:unknown_read", ctx("member"))).toBeNull();
  });

  it("formats a read result deterministically (no agent)", async () => {
    handlerMock.mockResolvedValue({ count: 1, events: [{ title: "Youth Camp", date: "Sat", venue: "Hall" }] });
    const out = await runMenuRead("menu:events", ctx("member"));
    expect(out).toContain("Upcoming events");
    expect(out).toContain("Youth Camp");
    expect(handlerMock).toHaveBeenCalled();
  });

  it("handles an empty read gracefully", async () => {
    handlerMock.mockResolvedValue({ count: 0, events: [] });
    expect(await runMenuRead("menu:events", ctx("member"))).toContain("No upcoming events");
  });

  it("enforces the tool's access check — a member is denied a rank-gated read, tool not run", async () => {
    const out = await runMenuRead("menu:birthdays", ctx("member")); // list_birthdays minRank 2
    expect(out).not.toContain("🎂");
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("serves the read when the role passes the rank check", async () => {
    handlerMock.mockResolvedValue({ count: 0, birthdays: [] });
    const out = await runMenuRead("menu:birthdays", ctx("pastor"));
    expect(out).toContain("🎂");
    expect(handlerMock).toHaveBeenCalled();
  });

  it("formats the giving summary in Naira", async () => {
    handlerMock.mockResolvedValue({ totalThisMonth: 150000, totalLastMonth: 90000, countThisMonth: 12, byType: { tithe: 100000, offering: 50000 } });
    const out = await runMenuRead("menu:giving_month", ctx("finance"));
    expect(out).toContain("₦150,000");
    expect(out).toContain("tithe");
  });
});
