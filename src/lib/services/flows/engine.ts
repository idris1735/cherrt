// The flow engine — deterministic task rails for WhatsApp.
//
// Core tasks (child check-in, later giving/prayer/join) run as state machines
// here: one step per turn, buttons for every choice, confirm-then-commit. The
// LLM agent stays as the fallback for everything that isn't a flow yet.
//
// The engine is PURE: it renders steps and advances state, and never calls the
// WhatsApp send API — the processor renders `FlowOutput` to the wire. That
// keeps every transition unit-testable without a Meta round trip.
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

// What the engine tells the processor to send for a step.
export type FlowOutput =
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; header?: string; buttons: Array<{ id: string; title: string }> }
  | { type: "list"; text: string; header?: string; buttonLabel: string; rows: Array<{ id: string; title: string; description?: string }> }
  | { type: "urlButton"; text: string; url: string; buttonLabel: string }; // leader → web-onboarding link

// Normalized user input for a turn.
export type FlowInput = { text: string; buttonId?: string };

// Everything a flow's handlers may need at runtime.
export type FlowRunContext = {
  phone: string;
  link: PhoneLink | null; // guest flows run with null and CREATE the link on completion
  personId?: string;
  session: WhatsAppSession;
};

export type FlowData = Record<string, unknown>;

// A step's onInput returns one transition.
export type Transition =
  | { to: string; patch?: FlowData } // advance to step `to`; merge patch into data; engine returns steps[to].render(...)
  | { stay: FlowOutput } // validation failed: re-show this output, keep the same step + data
  | { done: FlowOutput }; // flow finished (success OR user-cancel): clear activeFlow, return this output

export type FlowStep = {
  render: (data: FlowData, ctx: FlowRunContext) => FlowOutput | Promise<FlowOutput>;
  onInput: (input: FlowInput, data: FlowData, ctx: FlowRunContext) => Transition | Promise<Transition>;
};

export type FlowDefinition = {
  name: string;
  firstStep: string;
  initialData?: (ctx: FlowRunContext) => FlowData;
  steps: Record<string, FlowStep>;
};

const REGISTRY = new Map<string, FlowDefinition>();

export function registerFlow(def: FlowDefinition): void {
  REGISTRY.set(def.name, def);
}

export function getFlow(name: string): FlowDefinition | undefined {
  return REGISTRY.get(name);
}

// Words that leave any flow politely, at any step. Note: "stop"/"unsubscribe"
// are intentionally NOT here — those are the global opt-out and are handled by
// the processor BEFORE the engine is consulted.
const CANCEL_RE = /^(cancel|exit|quit|menu|start over)$/i;

// Begin a flow: persist state, return the first step's rendered output.
export async function startFlow(
  name: string,
  ctx: FlowRunContext,
  update: (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => Promise<void>,
): Promise<FlowOutput | null> {
  const def = getFlow(name);
  if (!def) return null;
  const data = def.initialData ? def.initialData(ctx) : {};
  await update({ activeFlow: { name, step: def.firstStep, data } });
  return def.steps[def.firstStep].render(data, ctx);
}

// Advance the active flow by one turn. Returns the output to send, or null if
// there is no active flow (caller falls through to normal handling).
export async function advanceFlow(
  input: FlowInput,
  ctx: FlowRunContext,
  update: (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => Promise<void>,
): Promise<FlowOutput | null> {
  const state = ctx.session.activeFlow;
  if (!state) return null;
  const def = getFlow(state.name);
  if (!def) {
    await update({ activeFlow: undefined });
    return null;
  }
  const step = def.steps[state.step];
  if (!step) {
    await update({ activeFlow: undefined });
    return null;
  }

  // Global polite exit from any step.
  if (CANCEL_RE.test(input.text.trim())) {
    await update({ activeFlow: undefined });
    return { type: "text", text: "No problem — I've stopped that. Tap *Menu* whenever you're ready. 🙏" };
  }

  const t = await step.onInput(input, state.data, ctx);
  if ("stay" in t) {
    return t.stay;
  }
  if ("done" in t) {
    await update({ activeFlow: undefined });
    return t.done;
  }
  // advance
  const nextData = { ...state.data, ...(t.patch ?? {}) };
  await update({ activeFlow: { name: state.name, step: t.to, data: nextData } });
  const nextStep = def.steps[t.to];
  if (!nextStep) {
    await update({ activeFlow: undefined });
    return null;
  }
  return nextStep.render(nextData, ctx);
}
