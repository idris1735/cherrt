# DeepSeek Prompt — Rails Everywhere (Prompt 3): name search + Give/Prayer/Pastoral/Join + AI demotion

## The goal

The client tested the guest rail and it felt direct — but the first thing he did was type a church **name** ("Grace chapel") where we only accepted a code, and got a dead "couldn't find that code." He's now said: **build everything we need, stop deferring.** So this prompt finishes the job:

1. **Church-name search** in the connect rail — one smart field takes a code, an `@username`, *or* a name.
2. **The remaining core member tasks on rails** — Give · Prayer · Pastoral care · Join a ministry (child check-in already shipped).
3. **Demote the AI to the edges** — menu taps and typed intents start flows; the LLM only answers genuine off-script questions; **delete the `clarificationStreak` circuit-breaker** because nothing wanders any more.

This builds on the proven engine (`flows/engine.ts`) and its two working flows (`child-checkin.ts`, `guest-connect.ts`) — **copy that exact template**. Do not restructure the engine beyond the one small `seed` addition in Task B.

## The five directness rules (unchanged)
1. Identity-first, silent — never re-ask what we already hold (incl. data the user just typed). 2. One rail per task. 3. One question at a time, buttons for every choice. 4. Confirm, then move. 5. Always a clean exit + clean close.

---

## Task A — Church-name search in the connect rail

**A1. New lookup** in `src/lib/services/whatsapp-workspace.ts`, next to `findWorkspaceByUsername`:
```ts
// Fuzzy church lookup by name — for members who know their church's name but
// not its code. Capped; the caller disambiguates when there are several.
export async function findWorkspacesByName(query: string): Promise<Array<{ id: string; slug: string; name: string; city: string }>> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const q = query.trim();
  if (q.length < 3) return [];
  const { data } = await db
    .from("workspaces")
    .select("id, slug, name, city")
    .ilike("name", `%${q}%`)
    .limit(6);
  return (data as Array<{ id: string; slug: string; name: string; city: string }>) ?? [];
}
```

**A2. Wire it into `guest-connect.ts`.** Extend `connect_code.onInput`: after the existing code/username `lookupChurch` miss, try name search instead of rejecting.

- Replace the current `connect_code.onInput` miss path so it: if `lookupChurch` returns a church → go to `confirm` (as today); else call `findWorkspacesByName(input.text)`:
  - **1 match** → `{ to: "confirm", patch: { workspaceId, workspaceSlug, workspaceName, workspaceCity } }`.
  - **2–6 matches** → `{ to: "pick_church", patch: { candidates: matches.map(m => ({ id: m.id, slug: m.slug, name: m.name, city: m.city })) } }`.
  - **0 matches** → `{ stay: <gentle reprompt> }` with copy: *"Hmm, I couldn't find that — send your church's *code* or `@username`, or type the church's name again."*

- Add a new step **`pick_church`** that renders the candidates as a WhatsApp list and resolves the pick:
```ts
pick_church: {
  render: (data) => {
    const cands = (data.candidates as Array<{ id: string; name: string; city: string }>) ?? [];
    return {
      type: "list",
      header: "Which church?",
      text: "I found a few — which one is yours?",
      buttonLabel: "Choose",
      rows: cands.map((c, i) => ({ id: `pick_${i}`, title: c.name.slice(0, 24), description: c.city || "" })),
    };
  },
  onInput: (input, data): Transition => {
    const cands = (data.candidates as Array<{ id: string; slug: string; name: string; city: string }>) ?? [];
    const m = /^pick_(\d+)$/.exec(input.buttonId ?? "");
    const chosen = m ? cands[Number(m[1])] : undefined;
    if (!chosen) {
      return { stay: {
        type: "list", header: "Which church?", text: "Tap one of the churches below.",
        buttonLabel: "Choose",
        rows: cands.map((c, i) => ({ id: `pick_${i}`, title: c.name.slice(0, 24), description: c.city || "" })),
      } };
    }
    return { to: "confirm", patch: { workspaceId: chosen.id, workspaceSlug: chosen.slug, workspaceName: chosen.name, workspaceCity: chosen.city ?? "" } };
  },
},
```
(The `confirm` step already provisions membership and lands the member menu — no change there.)

---

## Task B — Engine: optional seed data (small, general)

So a typed intent like "give 5000" can pre-fill a field and the flow never re-asks it (rule 1). In `flows/engine.ts`, extend `startFlow` with an optional `seed`:
```ts
export async function startFlow(
  name: string,
  ctx: FlowRunContext,
  update: (patch: { activeFlow: WhatsAppSession["activeFlow"] }) => Promise<void>,
  seed?: FlowData,
): Promise<FlowOutput | null> {
  const def = getFlow(name);
  if (!def) return null;
  const data = { ...(def.initialData ? def.initialData(ctx) : {}), ...(seed ?? {}) };
  await update({ activeFlow: { name, step: def.firstStep, data } });
  return def.steps[def.firstStep].render(data, ctx);
}
```
A flow's first step may then check for a pre-filled field and auto-advance (used by Give below). Nothing else in the engine changes.

---

## Task C — Give flow (`src/lib/services/flows/give.ts`)

Steps: `amount` → `giving_type` → `confirm` → commit via `give_now`. If seeded with `amount`, skip straight to `giving_type`.

```ts
import type { FlowDefinition, FlowInput, FlowData, Transition } from "@/lib/services/flows/engine";
import { getAgentTool } from "@/lib/services/agent/runtime";
import type { Role } from "@/lib/types";

const GIVING_TYPES = ["Tithe", "Offering", "Donation", "Pledge"];

export const giveFlow: FlowDefinition = {
  name: "give",
  firstStep: "amount",
  steps: {
    amount: {
      render: (data) => ({
        type: "text",
        text: data.amount ? `Give ₦${Number(data.amount).toLocaleString("en-NG")} — what type?` : "How much would you like to give? Send the amount in Naira (e.g. 5000).",
      }),
      onInput: (input: FlowInput, data: FlowData): Transition => {
        if (data.amount) return { to: "giving_type" }; // seeded — don't re-ask
        const n = Number(input.text.replace(/[₦,\s]/g, ""));
        if (!Number.isFinite(n) || n <= 0) return { stay: { type: "text", text: "Please send a valid amount in Naira, e.g. 5000." } };
        return { to: "giving_type", patch: { amount: Math.round(n) } };
      },
    },
    giving_type: {
      render: () => ({
        type: "list",
        header: "Giving",
        text: "What kind of giving is this?",
        buttonLabel: "Choose",
        rows: GIVING_TYPES.map((t) => ({ id: `gt_${t.toLowerCase()}`, title: t })),
      }),
      onInput: (input): Transition => {
        const m = /^gt_(\w+)$/.exec(input.buttonId ?? "");
        const typed = input.text.trim().toLowerCase();
        const type = m ? m[1] : GIVING_TYPES.map((t) => t.toLowerCase()).find((t) => t === typed);
        if (!type) return { stay: { type: "list", header: "Giving", text: "Tap the type of giving.", buttonLabel: "Choose", rows: GIVING_TYPES.map((t) => ({ id: `gt_${t.toLowerCase()}`, title: t })) } };
        return { to: "confirm", patch: { givingType: type } };
      },
    },
    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Confirm giving",
        text: `Give *₦${Number(data.amount).toLocaleString("en-NG")}* as *${String(data.givingType)}*? I'll send a secure payment link.`,
        buttons: [{ id: "give_go", title: "✅ Send link" }, { id: "give_cancel", title: "❌ Cancel" }],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "give_cancel") return { done: { type: "text", text: "No problem — nothing was charged. Tap *Menu* anytime. 🙏" } };
        if (input.buttonId !== "give_go" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return { stay: { type: "buttons", header: "Confirm giving", text: `Tap *Send link* to give ₦${Number(data.amount).toLocaleString("en-NG")} (${String(data.givingType)}), or *Cancel*.`, buttons: [{ id: "give_go", title: "✅ Send link" }, { id: "give_cancel", title: "❌ Cancel" }] } };
        }
        if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first." } };
        const tool = getAgentTool("give_now");
        if (!tool) return { done: { type: "text", text: "Giving is unavailable right now — please try again shortly." } };
        const res = (await tool.handler(
          { amount: data.amount, givingType: data.givingType },
          { workspaceId: ctx.link.workspaceId, role: ctx.link.userRole as Role, userName: ctx.link.userName, phone: ctx.phone, personId: ctx.personId },
        )) as { message?: string; error?: string };
        if (res.error) return { done: { type: "text", text: `Couldn't start the giving: ${res.error}` } };
        return { done: { type: "text", text: res.message ?? "Done." } };
      },
    },
  },
};
```
(`give_now` itself already returns the payment link — real Paystack when configured, demo link otherwise. The flow's `confirm` IS the confirmation gate; calling the handler directly is intended.)

---

## Task D — Prayer flow (`src/lib/services/flows/prayer.ts`)

Steps: `request` (free text) → `anon` (buttons) → commit via `capture_prayer_request`.
- `request.render`: *"What would you like the prayer team to pray about?"* → validate non-empty → `patch { request }` → `anon`.
- `anon.render`: buttons `[🙏 Share my name]` `[🔒 Keep anonymous]`. `share`→`{ anonymous: false }`, `keep`→`{ anonymous: true }`; then commit.
- commit: `getAgentTool("capture_prayer_request").handler({ request: data.request, anonymous: data.anonymous }, ctx-from-link)`; return `done` with the tool's message. Guard `!ctx.link` as in Give.

---

## Task E — Pastoral-care flow (`src/lib/services/flows/pastoral.ts`)

Steps: `category` (list) → `details` (text + Skip) → commit via `request_pastoral_care`.
- `category.render`: a list — rows: Marriage · Finance · Spiritual · Health · Bereavement · Something else (ids `pc_marriage`…`pc_other`). `patch { category }` (use the row label lowercased; `pc_other` → `"general"`) → `details`.
- `details.render`: buttons `[Skip]`; text *"Anything you'd like the pastor to know before they reach out? Type it, or tap Skip."* `flow_skip`→`{ details: null }`; typed→`{ details }`; then commit.
- commit: `request_pastoral_care({ category: data.category, details: data.details ?? undefined })`; `done` with the tool's message. Guard `!ctx.link`.

---

## Task F — Join-a-ministry flow (`src/lib/services/flows/join.ts`)

Steps: `department` (text; seedable) → `confirm` → commit via `join_department`.
- `department.render`: if seeded `department`, auto-advance to `confirm`; else text *"Which ministry would you like to join? e.g. choir, ushering, media, children, prayer band."* → validate non-empty → `patch { department }` → `confirm`.
- `confirm.render`: buttons `[✅ Apply]` `[✏️ Change]`; text *"Apply to join *{department}*? A leader will review and approve."* `apply`→commit; `change`→back to `department` (clear it); else reprompt.
- commit: `join_department({ department: data.department })`; `done` with the tool's message (it already notifies leaders with Approve/Decline buttons). Guard `!ctx.link`.

---

## Task G — Register all flows (`src/lib/services/flows/index.ts`)
```ts
import { registerFlow } from "@/lib/services/flows/engine";
import { childCheckinFlow } from "@/lib/services/flows/child-checkin";
import { guestConnectFlow } from "@/lib/services/flows/guest-connect";
import { giveFlow } from "@/lib/services/flows/give";
import { prayerFlow } from "@/lib/services/flows/prayer";
import { pastoralFlow } from "@/lib/services/flows/pastoral";
import { joinFlow } from "@/lib/services/flows/join";

[childCheckinFlow, guestConnectFlow, giveFlow, prayerFlow, pastoralFlow, joinFlow].forEach(registerFlow);
```

---

## Task H — Demote the AI to the edges (`whatsapp-processor.ts`)

**H1. Menu taps start flows, not the agent.** Replace the single `menu:checkin` special-case (added in Prompt 1) with a general map. Above the generic `if (buttonId.startsWith("menu:"))` block in `handleButtonReply`:
```ts
// Menu rows that map to a deterministic flow start the flow, not the agent.
const MENU_FLOW: Record<string, string> = {
  "menu:checkin": "child_checkin",
  "menu:give": "give",
  "menu:prayer": "prayer",
  "menu:pastoral": "pastoral",
  "menu:join_dept": "join",
};
if (link && MENU_FLOW[buttonId]) {
  const out = await startFlow(MENU_FLOW[buttonId], { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
  if (out) { await sendFlowOutput(from, out); return; }
}
```
Menu rows without a flow keep feeding their prompt to the agent (unchanged) — only these five are rail-backed for now.

**H2. Typed-intent router.** A linked member who *types* a task intent should land on the rail, not the wandering agent. Add this **immediately before** the `// ── Agent: primary handler …` block (`if (trimmed && link) { if (await dispatchToAgent…`). Remove the Prompt-1 typed child-checkin block (this supersedes it):
```ts
// ── Typed-intent router → deterministic flow (AI demotion) ──
// A plainly-typed task intent starts its rail; the agent below only handles
// genuine off-script questions. Never overrides an active flow (that returns
// far above). Seeds obvious params so the flow never re-asks them.
if (trimmed && link && !session.activeFlow) {
  const t = trimmed.toLowerCase();
  let flow: string | null = null;
  let seed: Record<string, unknown> | undefined;
  if (/\b(check\s*in|checkin)\b/.test(t) && /\b(child|kid|son|daughter|baby)\b/.test(t)) flow = "child_checkin";
  else if (/\b(give|giving|tithe|offering|donate|donation|seed|pledge)\b/.test(t)) {
    flow = "give";
    const amt = Number((t.match(/(?:₦|ngn|n)?\s*([\d,]{2,})/)?.[1] ?? "").replace(/,/g, ""));
    if (Number.isFinite(amt) && amt > 0) seed = { amount: Math.round(amt) };
  }
  else if (/\b(pray|prayer)\b/.test(t)) flow = "prayer";
  else if (/\b(pastor|pastoral|counsel|counselling|see a pastor)\b/.test(t)) flow = "pastoral";
  else if (/\b(join|volunteer|serve)\b/.test(t) && /\b(ministry|department|choir|ushering|media|team|unit)\b/.test(t)) flow = "join";
  if (flow) {
    const out = await startFlow(flow, { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch), seed);
    if (out) { await sendFlowOutput(from, out); return; }
  }
}
```

**H3. Delete the circuit-breaker.** In `handleAiResult`, remove the `clarificationStreak` logic entirely (the `hasArtifact` streak block that calls `sendHelpMenu` after 3 non-actionable replies) — it was a band-aid for the wandering agent, which no longer drives tasks. Also remove now-dead `clarificationStreak` writes elsewhere and the field usage; leave the `WhatsAppSession.clarificationStreak` type field in place (harmless) unless it's trivially removable without touching the DB.

Do **not** remove `dispatchToAgent`, `runGuestAgent`, or the agent tools — the agent stays as the FAQ/off-script answerer. This task only stops it from *driving* the five rail-backed tasks.

---

## Task I — Tests (Vitest; mirror `child-checkin.test.ts` / `guest-connect.test.ts`)

For each of `give`, `prayer`, `pastoral`, `join`: a flow test with a mocked `getAgentTool` returning a fake tool whose `handler` records args + returns a `{ message }`. Cover: happy path (assert the tool got the right args + a `done` output with its message), one validation reprompt (`stay`), and (Give) the seeded-amount path skipping the amount step, and the cancel path.

For name search: `guest-connect.test.ts` — mock `findWorkspacesByName`; a name with **1** match → `confirm`; **3** matches → `pick_church` renders a 3-row list and `pick_1` resolves to the second church's `confirm`; **0** matches → `stay`.

For the processor: `whatsapp-processor.test.ts` — a linked member tapping `menu:give` starts the `give` flow (not the agent); typing "I want to give 5000" starts `give` seeded with `amount: 5000` and the first prompt is the giving-type step (amount not re-asked); a typed FAQ ("what time is service?") still reaches the agent. Confirm no `clarificationStreak`/help-menu breaker fires.

---

## Verification & handback
- `npm run typecheck`, `npm run lint`, `npx vitest run` — all green, real output pasted. Prompt 1 + 2 tests must still pass.
- Manual WhatsApp (Vercel Ready, seed loaded): connect via **name** ("Grace") → pick if listed → in. Then Menu → **Give** → 5000 → Offering → ✅ → payment link; **Prayer** → text → anonymous → sent; **Pastoral** → pick category → Skip → "a pastor will reach out"; **Join** → "choir" → Apply → sent to leaders. Type "give 2000 tithe" → lands on the giving-type step (amount pre-filled).
- Report: files changed, real test output, and confirm the guest rail + child-checkin + the agent-as-FAQ are all intact.

## Guardrails
- Copy the proven flow template exactly; engine changes limited to Task B's `seed`.
- Every flow commits through its **real tool** (`give_now`/`capture_prayer_request`/`request_pastoral_care`/`join_department`) — never reimplement storage.
- Money stays confirmation-gated (Give's `confirm` step). Safety order unchanged: `#reset`/`stop`/risk-triage still win over any flow.
- The agent remains the off-script/FAQ answerer — this prompt removes it as the *driver* of the five rail tasks and deletes the breaker, nothing more.
