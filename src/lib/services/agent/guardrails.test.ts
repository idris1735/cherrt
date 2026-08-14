// WS-C: the AI-power boundaries, locked with tests so they can't drift.
// 1. No tool can ever create/alter database schema.
// 2. Consequential actions (money, broadcast, child release, special-category
//    writes) are ALL confirmation-gated.
// 3. The agent loop is step-capped — no unbounded self-prompting.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/agent/audit", () => ({ recordToolAudit: vi.fn().mockResolvedValue(undefined) }));

import { AGENT_TOOLS, runAgentLoop, DEFAULT_MAX_STEPS } from "@/lib/services/agent/runtime";
import { AGENT_PERSONA } from "@/lib/services/agent/persona";
import type { AgentTool, AgentContext } from "@/lib/services/agent/tools";

const tool = (name: string) => AGENT_TOOLS.find((t) => t.name === name)!;

beforeEach(() => { vi.clearAllMocks(); });

describe("no dynamic schema creation", () => {
  it("contains no tool that could create, alter or drop tables/columns/schemas", () => {
    const forbidden = /(create|alter|drop|truncate|migrate)[_\s]*(table|schema|column|database|index)/i;
    const offenders = AGENT_TOOLS.filter((t) => forbidden.test(t.name) || forbidden.test(t.description));
    expect(offenders).toEqual([]);
  });

  it("says so in the persona", () => {
    expect(AGENT_PERSONA).toMatch(/never create or change database tables/i);
  });
});

describe("confirmation gates on consequential actions", () => {
  it("money is gated", () => {
    expect(tool("give_now").requiresConfirmation).toBe(true);
  });
  it("broadcast is gated", () => {
    expect(tool("create_announcement").requiresConfirmation).toBe(true);
  });
  it("child release is gated", () => {
    expect(tool("release_child").requiresConfirmation).toBe(true);
  });
  it("special-category attribute writes are gated", () => {
    expect(tool("set_person_attribute").requiresConfirmation).toBe(true);
  });
});

describe("bounded loops — no unbounded self-prompting", () => {
  const ctx: AgentContext = { workspaceId: "ws1", role: "member" };
  const noop: AgentTool = {
    name: "noop_tool",
    description: "no-op",
    parameters: { type: "object", properties: {} },
    handler: async () => ({ done: true }),
  };

  it("stops after DEFAULT_MAX_STEPS even when the model keeps calling tools", async () => {
    const generate = vi.fn().mockResolvedValue({ functionCalls: [{ name: "noop_tool", args: {} }] });
    const outcome = await runAgentLoop({ generate, tools: [noop], ctx, systemPrompt: "s", userPrompt: "u" });
    expect(outcome.kind).toBe("text");
    expect((outcome as { text: string }).text).toContain("rephrasing");
    expect(generate).toHaveBeenCalledTimes(DEFAULT_MAX_STEPS);
  });

  it("respects a caller-set smaller cap", async () => {
    const generate = vi.fn().mockResolvedValue({ functionCalls: [{ name: "noop_tool", args: {} }] });
    await runAgentLoop({ generate, tools: [noop], ctx, systemPrompt: "s", userPrompt: "u", maxSteps: 2 });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
