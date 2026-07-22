import { describe, it, expect, vi } from "vitest";
import { runAgentLoop, looksLikeQuestion, looksLikeAgentAction, type GenerateFn, type GenerateResult } from "@/lib/services/agent/runtime";
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

describe("looksLikeQuestion", () => {
  it("routes clear questions to the agent", () => {
    expect(looksLikeQuestion("how many members do we have")).toBe(true);
    expect(looksLikeQuestion("what did we spend this month?")).toBe(true);
    expect(looksLikeQuestion("show me pending requests")).toBe(true);
    expect(looksLikeQuestion("any low stock items?")).toBe(true);
  });

  it("leaves creation commands to the creation path", () => {
    expect(looksLikeQuestion("draft a letter to the bank")).toBe(false);
    expect(looksLikeQuestion("log ₦15k for diesel")).toBe(false);
    expect(looksLikeQuestion("create a request for chairs")).toBe(false);
    expect(looksLikeQuestion("register a new member")).toBe(false);
  });

  it("ignores empty text", () => {
    expect(looksLikeQuestion("   ")).toBe(false);
  });
});

describe("looksLikeAgentAction", () => {
  it("matches the actions the agent has tools for (incl. gated document drafting)", () => {
    expect(looksLikeAgentAction("log ₦15k expense for diesel")).toBe(true);
    expect(looksLikeAgentAction("report an issue: the toilet is broken")).toBe(true);
    expect(looksLikeAgentAction("add 40 chairs to inventory")).toBe(true);
    expect(looksLikeAgentAction("restock the printer paper")).toBe(true);
    expect(looksLikeAgentAction("draft a letter to the bank")).toBe(true);
  });

  it("routes church operations to the agent", () => {
    expect(looksLikeAgentAction("please pray for my mum")).toBe(true);
    expect(looksLikeAgentAction("I'm a first timer today")).toBe(true);
    expect(looksLikeAgentAction("I'd like to see a pastor")).toBe(true);
    expect(looksLikeAgentAction("record 5000 offering received")).toBe(true);
    expect(looksLikeAgentAction("new visitor: John from Ada")).toBe(true);
  });

  it("routes children's check-in / pickup to the agent", () => {
    expect(looksLikeAgentAction("check in Timmy age 5")).toBe(true);
    expect(looksLikeAgentAction("pickup code 4821")).toBe(true);
    expect(looksLikeAgentAction("release the child with code 4821")).toBe(true);
    expect(looksLikeAgentAction("dropping off my daughter")).toBe(true);
  });

  it("routes event registration and department joining to the agent", () => {
    expect(looksLikeAgentAction("register me for the youth retreat")).toBe(true);
    expect(looksLikeAgentAction("sign up for the conference")).toBe(true);
    expect(looksLikeAgentAction("I want to join the choir")).toBe(true);
    expect(looksLikeAgentAction("joining the media team")).toBe(true);
  });

  it("routes life-journey intakes to the agent", () => {
    expect(looksLikeAgentAction("my father passed away")).toBe(true);
    expect(looksLikeAgentAction("we want marriage counselling")).toBe(true);
    expect(looksLikeAgentAction("I'd like to get baptized")).toBe(true);
    expect(looksLikeAgentAction("I gave my life to Christ today")).toBe(true);
  });

  it("routes announcements to the agent", () => {
    expect(looksLikeAgentAction("announce the vigil this Friday")).toBe(true);
    expect(looksLikeAgentAction("broadcast to all members")).toBe(true);
    expect(looksLikeAgentAction("tell everyone service moved to 9am")).toBe(true);
  });

  it("routes member giving payments to the agent", () => {
    expect(looksLikeAgentAction("I want to give my tithe")).toBe(true);
    expect(looksLikeAgentAction("give ₦5000 offering")).toBe(true);
    expect(looksLikeAgentAction("pay my tithe")).toBe(true);
  });

  it("does not intercept creations the agent has no tool for yet", () => {
    expect(looksLikeAgentAction("create a payment link for 5000")).toBe(false);
  });
});

describe("runAgentLoop", () => {
  it("returns text immediately when the model asks for no tools", async () => {
    const { fn } = scriptedGenerate([{ text: "Hello there." }]);
    const out = await runAgentLoop({ generate: fn, tools: [], ctx, systemPrompt: "sys", userPrompt: "hi" });
    expect(out).toEqual({ kind: "text", text: "Hello there." });
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
    expect(out.kind).toBe("text");
    if (out.kind === "text") expect(out.text).toContain("300,000");
    // second generate call must have seen the tool result fed back
    const secondCallContents = JSON.stringify(calls[1]);
    expect(secondCallContents).toContain("functionResponse");
    expect(secondCallContents).toContain("300000");
  });

  it("surfaces a confirmation-required tool as a pending outcome, without executing it", async () => {
    const handler = vi.fn();
    const gated: AgentTool = {
      name: "draft_document",
      description: "draft",
      parameters: { type: "object", properties: {} },
      requiresConfirmation: true,
      preview: (a) => `Draft ${a.title}?`,
      handler,
    };
    const { fn } = scriptedGenerate([{ functionCalls: [{ name: "draft_document", args: { title: "Letter" } }] }]);
    const out = await runAgentLoop({ generate: fn, tools: [gated], ctx, systemPrompt: "s", userPrompt: "u" });
    expect(out).toEqual({ kind: "pending", toolName: "draft_document", args: { title: "Letter" }, preview: "Draft Letter?" });
    expect(handler).not.toHaveBeenCalled();
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
    expect(out).toEqual({ kind: "text", text: "sorry" });
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
    expect(out).toEqual({ kind: "text", text: "handled" });
    expect(JSON.stringify(calls[1])).toContain("db down");
  });

  it("denies a caller who lacks the tool's minRank and never runs the handler", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const gated: AgentTool = { name: "record_giving", description: "d", parameters: { type: "object", properties: {} }, minRank: 3, mutates: true, handler };
    const { fn, calls } = scriptedGenerate([
      { functionCalls: [{ name: "record_giving", args: { amount: 5000 } }] },
      { text: "Sorry, you can't do that." },
    ]);
    const out = await runAgentLoop({
      generate: fn,
      tools: [gated],
      ctx: { workspaceId: "ws1", role: "member" },
      systemPrompt: "s",
      userPrompt: "record 5000 giving",
    });
    expect(handler).not.toHaveBeenCalled();
    expect(out).toEqual({ kind: "text", text: "Sorry, you can't do that." });
    expect(JSON.stringify(calls[1])).toMatch(/permission/i);
  });

  it("allows a caller with sufficient rank to run a gated tool", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const gated: AgentTool = { name: "record_giving", description: "d", parameters: { type: "object", properties: {} }, minRank: 3, mutates: true, handler };
    const { fn } = scriptedGenerate([
      { functionCalls: [{ name: "record_giving", args: { amount: 5000 } }] },
      { text: "Recorded." },
    ]);
    await runAgentLoop({ generate: fn, tools: [gated], ctx: { workspaceId: "ws1", role: "finance" }, systemPrompt: "s", userPrompt: "u" });
    expect(handler).toHaveBeenCalled();
  });

  it("never PROPOSES a gated confirmation tool the caller can't use", async () => {
    const handler = vi.fn();
    const gated: AgentTool = {
      name: "release_child",
      description: "d",
      parameters: { type: "object", properties: {} },
      requiresConfirmation: true,
      minRank: 1,
      mutates: true,
      preview: () => "Release?",
      handler,
    };
    const { fn, calls } = scriptedGenerate([
      { functionCalls: [{ name: "release_child", args: { pickupCode: "1234" } }] },
      { text: "You can't release a child." },
    ]);
    const out = await runAgentLoop({
      generate: fn,
      tools: [gated],
      ctx: { workspaceId: "ws1", role: "member" },
      systemPrompt: "s",
      userPrompt: "release the child",
    });
    // member (rank 0) < minRank 1 → not proposed as pending, denied in the loop
    expect(out).toEqual({ kind: "text", text: "You can't release a child." });
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(calls[1])).toMatch(/permission/i);
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
    expect(out.kind).toBe("text");
    if (out.kind === "text") expect(out.text).toMatch(/couldn't finish/i);
    expect(calls.length).toBe(3);
  });
});
