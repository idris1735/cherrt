# DeepSeek Prompt — Flow Engine + Child Check-in (Prompt 1 of 2)

## Why we're doing this

Client feedback (2026-08-20, Kola): **the bot wanders — "it talks and asks too much and still doesn't accomplish the task."** He hand-built the reference in Landbot + Botpress before handing us the project (screenshots in repo `feedback/`). The instruction is **not** to copy his menus — it's to adopt the **directness** and the **seamless journey**: you tap, it moves, the task gets done.

Root cause in our code: our WhatsApp router is **LLM-first**. A linked member's message falls straight through to `dispatchToAgent` (the Gemini tool-loop), which *decides* what to say each turn — so it asks, re-asks, opens side topics, and often never finishes. The tell: `handleAiResult` has a `clarificationStreak >= 3 → show help menu` circuit breaker. Someone already knew it wanders and bolted on a "3 strikes → buttons" patch.

The fix is architectural: **core tasks run on a deterministic state machine (rails); the LLM only sits on the edges.** We already have this pattern — the church-signup / post-approval-setup / assign-role flows in `onboarding-flow.ts` are real state machines. This prompt **generalizes that pattern into one small flow engine** and ships the **first flow (Child check-in)** on it, end-to-end, so we can test the feel on WhatsApp and lock it before building the other three (Give, Prayer, Join — Prompt 2).

## The five directness rules (every flow must obey these)

1. **Identity-first, silent.** The flow only ever runs for an already-linked member — never re-ask their name or church.
2. **One rail per task.** Once a flow is active, every message advances *this* flow. Never open a second topic mid-flow.
3. **One question at a time, always a choice where a choice exists.** Buttons/list for choices; free text only for a genuinely open field (a name). Never ask two things in one message.
4. **Confirm, then move.** Reflect the collected facts back once, ✅/✏️, then commit.
5. **Always a clean exit and a clean close.** `cancel`/`exit`/`menu` (typed) leaves the flow politely at any step; completion ends with a clear closing message.

## Scope — do EXACTLY this, nothing more

**IN scope (Prompt 1):**
- A generic flow engine module.
- One flow definition: `child_checkin`, committing via the existing `check_in_child` tool.
- Wiring in `whatsapp-processor.ts` so (a) a member mid-flow has every message routed to the engine, and (b) the "Check in a child" menu row **starts the flow** instead of feeding a prompt to the agent.
- A DB column + session field to persist flow state.
- Vitest unit tests for the engine and the flow.

**OUT of scope (do NOT touch in this prompt):**
- ❌ Do **not** remove or rewrite the Gemini agent path (`dispatchToAgent`, `runGuestAgent`, `runCherttCommand`). It stays as the fallback for everything that isn't a flow yet.
- ❌ Do **not** delete the `clarificationStreak` circuit breaker yet (that happens in Prompt 2 once all flows exist).
- ❌ Do **not** touch the existing `onboarding` flows (signup/setup/assign-role) or `onboarding-flow.ts`.
- ❌ Do **not** modify any tool in `child-tools.ts` — call `check_in_child` exactly as it is.
- ❌ Do **not** build Give / Prayer / Join flows — those are Prompt 2.

---

## Task 1 — Session state for a generic flow

**File: `src/lib/services/whatsapp-session.ts`**

Add a new **generic** flow field to `WhatsAppSession` (separate from the signup-specific `onboarding` union — do not overload `onboarding`):

```ts
// A deterministic task flow in progress (child check-in, giving, etc.),
// run by the flow engine. Separate from `onboarding` (church setup) so task
// flows share one generic engine. `name` selects the flow definition; `data`
// is that flow's collected fields.
activeFlow?: {
  name: string;      // e.g. "child_checkin"
  step: string;      // current step id within that flow
  data: Record<string, unknown>;
};
```

- Add `active_flow: WhatsAppSession["activeFlow"] | null` to the `DbRow` type.
- Wire it in `toSession` (`activeFlow: row.active_flow ?? undefined`) and `toDbRow` (`active_flow: session.active_flow ?? null` — i.e. `session.activeFlow ?? null`).
- `updateSession` is already generic (`Partial<...>`), so no change there.
- `resetSession` already deletes the whole row — no change needed (verify it still clears everything).

**DB migration** — add the column. Put the SQL in a new file `supabase/migrations/<timestamp>_whatsapp_sessions_active_flow.sql` (match the existing migration naming in that folder; if the folder differs, follow the repo's established migration location):

```sql
alter table whatsapp_sessions add column if not exists active_flow jsonb;
```

---

## Task 2 — The flow engine

**File (new): `src/lib/services/flows/engine.ts`**

This is the reusable runtime. Keep it small, pure, and fully unit-testable. It renders steps and advances state; it does **not** call the WhatsApp send API itself (the processor does that, so the engine stays testable).

### Types

```ts
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

// What the engine tells the processor to send for a step.
export type FlowOutput =
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; header?: string; buttons: Array<{ id: string; title: string }> }
  | { type: "list"; text: string; header?: string; buttonLabel: string; rows: Array<{ id: string; title: string; description?: string }> };

// Normalized user input for a turn.
export type FlowInput = { text: string; buttonId?: string };

// Everything a flow's handlers may need at runtime.
export type FlowRunContext = {
  phone: string;
  link: PhoneLink;          // flows only run for linked members — never null
  personId?: string;
  session: WhatsAppSession;
};

export type FlowData = Record<string, unknown>;

// A step's onInput returns one transition.
export type Transition =
  | { to: string; patch?: FlowData }   // advance to step `to`; merge patch into data; engine returns steps[to].render(...)
  | { stay: FlowOutput }               // validation failed: re-show this output, keep the same step + data
  | { done: FlowOutput };              // flow finished (success OR user-cancel): clear activeFlow, return this output

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
```

### Registry + API

```ts
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
  if (!def) { await update({ activeFlow: undefined }); return null; }
  const step = def.steps[state.step];
  if (!step) { await update({ activeFlow: undefined }); return null; }

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
  if (!nextStep) { await update({ activeFlow: undefined }); return null; }
  return nextStep.render(nextData, ctx);
}
```

- `update` is injected (the processor passes a closure over `updateSession(from, …)`), keeping the engine free of the session module for tests.
- Every branch either returns an output or null; no silent dead ends.

**File (new): `src/lib/services/flows/index.ts`** — registers all flows once (import for side effects):

```ts
import { registerFlow } from "@/lib/services/flows/engine";
import { childCheckinFlow } from "@/lib/services/flows/child-checkin";

registerFlow(childCheckinFlow);
```

Import `@/lib/services/flows` once at the top of `whatsapp-processor.ts` so registration runs.

---

## Task 3 — The Child check-in flow

**File (new): `src/lib/services/flows/child-checkin.ts`**

Collect **child name → age (skippable) → allergies/notes (skippable) → confirm → commit**. Commit by calling the existing `check_in_child` tool handler (it inserts the row, sends the QR pickup pass image, and returns the pickup-code message). One question per step, buttons where there's a choice, confirm before commit.

```ts
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}

function summary(data: FlowData): string {
  const name = String(data.childName ?? "");
  const bits = [`*${name}*`];
  if (data.age != null) bits.push(`age ${data.age}`);
  if (data.allergies) bits.push(`allergies: ${data.allergies}`);
  return bits.join(", ");
}

export const childCheckinFlow: FlowDefinition = {
  name: "child_checkin",
  firstStep: "child_name",
  steps: {
    child_name: {
      render: () => ({
        type: "text",
        text: "Let's check your child in. 👶\n\nWhat's the child's *full name*?",
      }),
      onInput: (input: FlowInput): Transition => {
        const name = input.text.trim();
        if (!looksLikeName(name)) {
          return { stay: { type: "text", text: "Please send the child's name (first and last is best)." } };
        }
        return { to: "age", patch: { childName: name } };
      },
    },

    age: {
      render: (data) => ({
        type: "buttons",
        header: "Child check-in",
        text: `How old is ${String(data.childName)}? Type a number, or tap *Skip*.`,
        buttons: [{ id: "flow_skip", title: "Skip" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_skip") return { to: "allergies", patch: { age: null } };
        const n = Number(input.text.trim());
        if (!Number.isFinite(n) || n < 0 || n > 18) {
          return { stay: { type: "buttons", header: "Child check-in", text: "Please send an age between 0 and 18, or tap *Skip*.", buttons: [{ id: "flow_skip", title: "Skip" }] } };
        }
        return { to: "allergies", patch: { age: Math.floor(n) } };
      },
    },

    allergies: {
      render: () => ({
        type: "buttons",
        header: "Child check-in",
        text: "Any *allergies or medical notes* the children's team should know? Type them, or tap *None*.",
        buttons: [{ id: "flow_none", title: "None" }],
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "flow_none") return { to: "confirm", patch: { allergies: null } };
        const notes = input.text.trim();
        if (!notes) return { to: "confirm", patch: { allergies: null } };
        return { to: "confirm", patch: { allergies: notes } };
      },
    },

    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm check-in",
        text: `Checking in ${summary(data)}.\n\nAll correct?`,
        buttons: [
          { id: "flow_commit", title: "✅ Check in" },
          { id: "flow_restart", title: "✏️ Start over" },
        ],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "flow_restart") {
          return { to: "child_name", patch: { childName: undefined, age: undefined, allergies: undefined } };
        }
        if (input.buttonId !== "flow_commit" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm check-in", text: `Tap *Check in* to confirm, or *Start over*.\n\n${summary(data)}`, buttons: [{ id: "flow_commit", title: "✅ Check in" }, { id: "flow_restart", title: "✏️ Start over" }] } };
        }
        // Commit through the real tool — it inserts the check-in, sends the QR
        // pickup pass, and returns the pickup-code message.
        const tool = getAgentTool("check_in_child");
        if (!tool) return { done: { type: "text", text: "Sorry — check-in is unavailable right now. Please try again shortly." } };
        const res = (await tool.handler(
          { childName: data.childName, age: data.age ?? undefined, allergies: data.allergies ?? undefined },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't complete the check-in: ${res.error}` } };
        return { done: { type: "text", text: `${res.message ?? "Done."}\n\nTap *Menu* if there's anything else. 🙏` } };
      },
    },
  },
};
```

Notes:
- `check_in_child` has **no `minRank`** (a parent checking in their own child), so this flow is available to any linked member — correct.
- The tool already sends the QR image and handles storage; the flow must not duplicate any of that.
- Every `onInput` returns a `Transition` on every path — no unhandled input.

---

## Task 4 — Wire the engine into the processor

**File: `src/lib/services/whatsapp-processor.ts`**

### 4a. Import registration + a send helper

At the top, add `import "@/lib/services/flows";` (side-effect registration) and import the engine:
```ts
import { advanceFlow, startFlow, type FlowOutput } from "@/lib/services/flows/engine";
```

Add a helper near the other send helpers that renders a `FlowOutput` to WhatsApp, mirroring the existing try/catch-to-text fallback used elsewhere in this file:

```ts
async function sendFlowOutput(from: string, out: FlowOutput): Promise<void> {
  if (out.type === "buttons") {
    try { await sendInteractiveButtons(from, out.text, out.buttons, out.header); return; }
    catch { await sendTextMessage(from, out.text); return; }
  }
  if (out.type === "list") {
    try { await sendInteractiveList(from, out.text, out.buttonLabel, out.rows, out.header); return; }
    catch { await sendTextMessage(from, out.text); return; }
  }
  await sendTextMessage(from, out.text);
}
```

### 4b. Advance an in-progress flow (the key insertion)

Insert this block **immediately after** the existing "in-progress guided flows (signup, post-approval setup, assign-role)" block (the one that calls `advanceSignupFlow`/`advanceSetupFlow`/`advanceAssignRoleFlow`) and **before** the `if (type === "interactive" && message.buttonReplyId)` line. This placement is deliberate:

- It runs **after** the global guards that must always win: message-claim, welcome gate, risk triage (scam/safeguarding), `#reset`, platform-admin, and multi-church disambiguation are all above it and `return` before reaching here.
- It runs **before** button routing and the agent, so a member mid-flow has **every** message (typed or button-tap) routed to the engine.

```ts
// ── In-progress task flow (flow engine) ──
// A member mid-flow has every turn routed to the engine — text OR button tap —
// so the journey stays on one rail. Global opt-out keywords still escape.
if (link && session.activeFlow && !/^(stop|unsubscribe|remove me)$/i.test(trimmed)) {
  const runCtx = { phone: from, link, personId, session };
  const input = { text: trimmed, buttonId: message.buttonReplyId };
  const out = await advanceFlow(input, runCtx, (patch) => updateSession(from, patch));
  if (out) {
    await addToHistory(from, "user", message.buttonReplyId ? `[tap] ${message.buttonReplyId}` : trimmed);
    await sendFlowOutput(from, out);
    return;
  }
}
```

(`#reset` is already handled above this point and returns, so it can never be swallowed by a flow. `stop`/`unsubscribe` are excluded here so they fall through to the existing opt-out handler.)

### 4c. Start the flow from the "Check in a child" menu row

The menu row `menu:checkin` currently feeds the prompt `"Check my child in…"` to the agent (via `menuPromptFor` in `handleButtonReply`). Intercept it **before** that generic `menu:` handling so it starts the deterministic flow instead. In `handleButtonReply`, add — above the existing `if (buttonId.startsWith("menu:"))` block:

```ts
// Menu rows that map to a deterministic flow start the flow, not the agent.
if (buttonId === "menu:checkin" && link) {
  const out = await startFlow("child_checkin", { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
  if (out) { await sendFlowOutput(from, out); return; }
}
```

### 4d. (Optional, keep minimal) typed entry

Also let a plainly-typed check-in intent start the flow, so it isn't only reachable by the menu. Add, in the main handler near the other trigger checks (after the report intents, before the agent dispatch at `if (trimmed && link)`):

```ts
if (trimmed && link && /\b(check\s*in|checkin)\b/i.test(trimmed) && /\b(child|kid|son|daughter|baby)\b/i.test(trimmed)) {
  const out = await startFlow("child_checkin", { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
  if (out) { await sendFlowOutput(from, out); return; }
}
```

Do not add any broader NLU than this regex in Prompt 1 — richer intent routing is Prompt 2.

---

## Task 5 — Tests (Vitest, mirror existing test style)

**File (new): `src/lib/services/flows/engine.test.ts`**
- `startFlow` returns the first step's render output and calls `update` with `{ activeFlow: { name, step: firstStep, data } }`.
- `advanceFlow` with no `activeFlow` returns `null`.
- A `{ to }` transition merges `patch`, persists the new step, and returns the next step's render output.
- A `{ stay }` transition returns its output and does **not** change the step.
- A `{ done }` transition clears `activeFlow` (calls `update` with `{ activeFlow: undefined }`) and returns its output.
- A cancel word (`"cancel"`, `"menu"`) at any step clears the flow and returns the polite exit text.
- Use a tiny throwaway `FlowDefinition` registered in the test — do not depend on the child flow here.

**File (new): `src/lib/services/flows/child-checkin.test.ts`**
- Mock `getAgentTool("check_in_child")` to return a fake tool whose `handler` records its args and returns `{ message: "✅ … Pickup code: *123456*" }`.
- **Happy path:** drive child_name → age → allergies → confirm(commit); assert the tool handler was called with `{ childName, age, allergies }` and the flow ends with a `done` output containing the tool's message.
- **Invalid age:** sending `"abc"` at the age step returns a `stay` output and stays on the age step.
- **Skip age / None allergies:** `flow_skip` sets `age: null`; `flow_none` sets `allergies: null`; both reach confirm.
- **Start over:** `flow_restart` at confirm returns to `child_name` with cleared data.
- **Tool error:** if the handler returns `{ error: "storage unavailable" }`, the flow ends with a `done` output surfacing the error, and `activeFlow` is cleared.

Follow the existing mocking conventions in `child-tools.test.ts` / `whatsapp-processor.test.ts` (Vitest `vi.mock`, hoisting-safe factories).

---

## Verification & handback

- Run `npm run lint`, `npm run typecheck` (or `tsc --noEmit`), and `npm test` — all green. Do **not** claim done without the test output.
- Manual WhatsApp test path once deployed (Vercel auto-deploys `main`; wait for "Ready"): a linked member taps **Menu → 👶 Check in a child**, then walks name → age (tap Skip) → allergies (tap None) → **✅ Check in**, and receives the pickup code + QR image. Typing `menu` mid-flow exits politely.
- Report back with: files changed, the test run output, and confirmation that the agent path and onboarding flows are untouched.

## Guardrails recap (do not violate)

- The engine renders + advances state only; it never calls the WhatsApp API directly (keeps it unit-testable).
- Flows run **only** for linked members (`link` present). `check_in_child` is called exactly as-is.
- Global safety (scam/safeguarding), `#reset`, and opt-out (`stop`) always win over a flow — the insertion point guarantees this.
- The Gemini agent, `runGuestAgent`, and the circuit breaker stay in place; this prompt adds a rail, it does not remove the AI.
