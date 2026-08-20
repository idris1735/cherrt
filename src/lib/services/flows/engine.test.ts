import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerFlow, getFlow, startFlow, advanceFlow } from "@/lib/services/flows/engine";
import type { FlowDefinition, FlowOutput, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

// A tiny throwaway flow, registered per-test run — no dependency on the child flow.
const counting: FlowDefinition = {
  name: "test_counting",
  firstStep: "one",
  steps: {
    one: {
      render: (data) => ({ type: "text", text: `Step one (n=${data.n ?? "?"})` }),
      onInput: (input, data): Transition => {
        const n = Number(input.text);
        if (!Number.isFinite(n)) return { stay: { type: "text", text: "Need a number." } };
        return { to: "two", patch: { n } };
      },
    },
    two: {
      render: (data) => ({ type: "buttons", text: `Now ${data.n}. Double it?`, buttons: [{ id: "double", title: "Double it" }] }),
      onInput: (input, data): Transition => {
        if (input.buttonId === "done") return { done: { type: "text", text: `Finished at ${data.n}` } };
        return { done: { type: "text", text: `Finished at ${data.n}` } };
      },
    },
  },
};

const link: PhoneLink = {
  phoneNumber: "2348012345678", userId: null, workspaceId: "ws1", workspaceSlug: "daystar",
  workspaceName: "Daystar", userName: "Ada", userRole: "member",
};

function harness() {
  const session = { phoneNumber: "2348012345678", welcomed: true, demoBalance: 0, history: [] } as WhatsAppSession;
  const updates: Array<{ activeFlow?: WhatsAppSession["activeFlow"] }> = [];
  const update = async (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => {
    updates.push(patch);
    if (patch.activeFlow === undefined) session.activeFlow = undefined;
    else session.activeFlow = patch.activeFlow;
  };
  const ctx: FlowRunContext = { phone: "2348012345678", link, personId: "p1", session };
  return { session, updates, update, ctx };
}

beforeEach(() => {
  vi.clearAllMocks();
  registerFlow(counting);
});

describe("flow engine", () => {
  it("startFlow persists first-step state and renders it", async () => {
    const { ctx, update, updates } = harness();
    const out = (await startFlow("test_counting", ctx, update)) as FlowOutput;
    expect(out).toMatchObject({ type: "text", text: expect.stringContaining("Step one") });
    expect(updates).toEqual([{ activeFlow: { name: "test_counting", step: "one", data: {} } }]);
  });

  it("startFlow returns null for an unknown flow", async () => {
    const { ctx, update } = harness();
    expect(await startFlow("nope", ctx, update)).toBeNull();
  });

  it("advanceFlow returns null when no flow is active", async () => {
    const { ctx, update } = harness();
    expect(await advanceFlow({ text: "1" }, ctx, update)).toBeNull();
  });

  it("a { to } transition merges patch, persists the next step, and renders it", async () => {
    const { ctx, update, session } = harness();
    session.activeFlow = { name: "test_counting", step: "one", data: {} };
    const out = (await advanceFlow({ text: "5" }, ctx, update)) as FlowOutput;
    expect(out).toMatchObject({ type: "buttons", text: expect.stringContaining("Now 5") });
    expect(session.activeFlow).toMatchObject({ step: "two", data: { n: 5 } });
  });

  it("a { stay } transition re-shows its output without changing the step", async () => {
    const { ctx, update, session } = harness();
    session.activeFlow = { name: "test_counting", step: "one", data: {} };
    const out = (await advanceFlow({ text: "abc" }, ctx, update)) as FlowOutput;
    expect(out).toMatchObject({ type: "text", text: "Need a number." });
    expect(session.activeFlow).toMatchObject({ step: "one", data: {} });
  });

  it("a { done } transition clears the flow and returns its output", async () => {
    const { ctx, update, session } = harness();
    session.activeFlow = { name: "test_counting", step: "two", data: { n: 5 } };
    const out = (await advanceFlow({ text: "whatever" }, ctx, update)) as FlowOutput;
    expect(out).toMatchObject({ type: "text", text: "Finished at 5" });
    expect(session.activeFlow).toBeUndefined();
  });

  it("cancel words clear the flow at any step with a polite exit", async () => {
    for (const word of ["cancel", "menu", "start over"]) {
      const { ctx, update, session } = harness();
      session.activeFlow = { name: "test_counting", step: "two", data: { n: 5 } };
      const out = (await advanceFlow({ text: word }, ctx, update)) as FlowOutput;
      expect(out).toMatchObject({ type: "text", text: expect.stringContaining("stopped that") });
      expect(session.activeFlow).toBeUndefined();
    }
  });

  it("advanceFlow clears a dangling flow whose definition no longer exists", async () => {
    const { ctx, update, session } = harness();
    session.activeFlow = { name: "deleted_flow", step: "one", data: {} };
    expect(await advanceFlow({ text: "x" }, ctx, update)).toBeNull();
    expect(session.activeFlow).toBeUndefined();
  });

  it("getFlow returns registered definitions", () => {
    expect(getFlow("test_counting")).toBeDefined();
    expect(getFlow("missing")).toBeUndefined();
  });
});
