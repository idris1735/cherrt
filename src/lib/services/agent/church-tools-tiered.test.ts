import { describe, it, expect, vi } from "vitest";

// The whole point: when the church isn't approved, sensitive tools refuse.
vi.mock("@/lib/services/kyc/tiered-access", () => ({ churchApproved: vi.fn().mockResolvedValue(false) }));

import { CHURCH_TOOLS } from "@/lib/services/agent/church-tools";

const ctx = { workspaceId: "ws1", role: "creator", userName: "x", phone: "1", personId: null } as any;
const tool = (name: string) => CHURCH_TOOLS.find((t) => t.name === name)!;

describe("sensitive tools are gated when the church isn't approved", () => {
  it("record_giving refuses", async () => {
    const res = (await tool("record_giving").handler({ amount: 5000 }, ctx)) as { error?: string };
    expect(res.error).toMatch(/being verified/i);
  });
  it("add_member refuses", async () => {
    const res = (await tool("add_member").handler({ name: "Grace" }, ctx)) as { error?: string };
    expect(res.error).toMatch(/being verified/i);
  });
});
