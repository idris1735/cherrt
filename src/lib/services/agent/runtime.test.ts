import { describe, it, expect, vi } from "vitest";
import { runAgentLoop, type GenerateFn, type GenerateResult } from "@/lib/services/agent/runtime";
import type { AgentTool, AgentContext } from "@/lib/services/agent/tools";

const ctx: AgentContext = { workspaceId: "branch-a", role: "owner" };

function tool(name: string, handler: AgentTool["handler"]): AgentTool {
  return { name, description: name, parameters: { type: "object", properties: {} }, handler };
}

// A fake model that returns a scripted sequence of results, one per call.
function scriptedGenerate(script: GenerateResult[]): { fn: GenerateFn; calls: unknown[][] } {
  const calls: unknown[][] = [];
  let i = 0;
  const fn: GenerateFn = async (contents) => {
    calls.push(contents.slice());
    return script[Math.min(i++, script.length - 1)];
  };
  return { fn, calls };
}

describe("runAgentLoop", () => {
  it("returns text immediately when the model asks for no tools", async () => {
    const { fn } = scriptedGenerate([{ text: "Hello there." }]);
    const out = await runAgentLoop({ generate: fn, tools: [], ctx, systemPrompt: "sys", userPrompt: "hi" });
    expect(out).toBe("Hello there.");
  });

  it("executes a requested tool, feeds the result back, then returns the final text", async () => {
    const handler = vi.fn().mockResolvedValue({ totalThisMonth: 300000 });
    const giving = tool("get_giving_summary", handler);
    const { fn, calls } = scriptedGenerate([
      { functionCalls: [{ name: "get_giving_summary", args: {} }] },
      { text: "You've received ₦300,000 this month." },
    ]);

    const out = await runAgentLoop({
      generate: fn,
      tools: [giving],
      ctx,
      systemPrompt: "sys",
      userPrompt: "how much giving this month?",
    });

    expect(handler).toHaveBeenCalledWith({}, ctx);
    expect(out).toContain("300,000");
    // second generate call must have seen the tool result fed back
    const secondCallContents = JSON.stringify(calls[1]);
    expect(secondCallContents).toContain("functionResponse");
    expect(secondCallContents).toContain("300000");
  });

  it("passes the workspace-scoped ctx to the tool handler", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const { fn } = scriptedGenerate([
      { functionCalls: [{ name: "t", args: { a: 1 } }] },
      { text: "done" },
    ]);
    await runAgentLoop({ generate: fn, tools: [tool("t", handler)], ctx, systemPrompt: "s", userPrompt: "u" });
    expect(handler).toHaveBeenCalledWith({ a: 1 }, ctx);
  });

  it("feeds an unknown-tool call back as a structured error", async () => {
    const { fn, calls } = scriptedGenerate([
      { functionCalls: [{ name: "does_not_exist", args: {} }] },
      { text: "sorry" },
    ]);
    const out = await runAgentLoop({ generate: fn, tools: [], ctx, systemPrompt: "s", userPrompt: "u" });
    expect(out).toBe("sorry");
    expect(JSON.stringify(calls[1])).toContain("Unknown tool");
  });

  it("catches a throwing tool handler and feeds the error back instead of crashing", async () => {
    const boom = tool("boom", async () => {
      throw new Error("db down");
    });
    const { fn, calls } = scriptedGenerate([
      { functionCalls: [{ name: "boom", args: {} }] },
      { text: "handled" },
    ]);
    const out = await runAgentLoop({ generate: fn, tools: [boom], ctx, systemPrompt: "s", userPrompt: "u" });
    expect(out).toBe("handled");
    expect(JSON.stringify(calls[1])).toContain("db down");
  });

  it("stops at the step cap instead of looping forever", async () => {
    // Always asks for a tool, never answers in text.
    const alwaysCalls: GenerateResult = { functionCalls: [{ name: "t", args: {} }] };
    const { fn, calls } = scriptedGenerate([alwaysCalls]);
    const out = await runAgentLoop({
      generate: fn,
      tools: [tool("t", async () => ({}))],
      ctx,
      systemPrompt: "s",
      userPrompt: "u",
      maxSteps: 3,
    });
    expect(out).toMatch(/couldn't finish/i);
    expect(calls.length).toBe(3);
  });
});
