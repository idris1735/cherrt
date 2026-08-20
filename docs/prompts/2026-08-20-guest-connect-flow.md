# DeepSeek Prompt — Guest → Connect-to-Church Rail (Prompt 2)

## Why this, and why now

We shipped the flow engine + child-checkin rail (Prompt 1, commit `08b67c2`). But when the client tested on WhatsApp he **felt nothing** — because the child-checkin rail only shows for a **linked member**, and a first-time user is a **guest**. The part every user actually hits first — the guest journey — is still the OLD wandering bot. Real transcript from the test:

> Guest → consent → "who are you" → taps **"Here for my child"** → child-safety note + `[Send my code] [Talk to a leader]` → taps **"Talk to a leader"** → gets **the wall-of-text help menu** ("Just talk to me normally… 💰 Give… 🕊️ Prayer…").

That dead-ending "Talk to a leader → wall of text" **is** the wandering Kola hates. So this prompt puts the **front door on rails**: consent → who-are-you → (name) → church code → confirm → **you're connected, here's your menu**. After this, the child-checkin rail from Prompt 1 becomes reachable (tap it from the member menu) and the whole journey finally feels like Landbot: tap, tap, done.

This reuses the engine from Prompt 1. **Do not rebuild the engine** — extend it minimally and add one flow.

## The five directness rules (unchanged — every flow obeys them)

1. Identity-first, silent (ask the name once, never twice). 2. One rail per task. 3. One question at a time, buttons for every choice. 4. Confirm, then move. 5. Always a clean exit + clean close.

## Scope — do EXACTLY this

**IN:**
- Small engine extension: allow a flow to run for a **guest** (nullable `link`); add a `urlButton` `FlowOutput` variant.
- One new flow: `guest_connect` — the whole guest front door, ending either in a live church membership + member menu, or (for a church leader) the secure web-onboarding link.
- Rewire the guest entry points (consent-agree, the "menu/how does this work" intents) to **start the flow** instead of `sendGuestWelcome`.
- Move the engine's in-flow advance block **earlier** so an active flow wins over the ad-hoc code matchers.
- Tests.

**OUT — do NOT:**
- ❌ Rebuild or restructure the engine (`flows/engine.ts`) beyond the two small additions specified.
- ❌ Touch the child-checkin flow's behaviour (only the one nullable-link guard below).
- ❌ Build Give / Prayer / Join flows, or search-by-church-name (both are later prompts).
- ❌ Remove the Gemini agent, `runGuestAgent`, or the `clarificationStreak` breaker.
- ❌ Delete `sendGuestWelcome` or the old `guest_*` button handlers — leave them in place (harmless; superseded). We clean them up in a later pass.

---

## Task 1 — Engine extensions (`src/lib/services/flows/engine.ts`)

**1a. Nullable link.** A guest flow has no membership yet, so:
```ts
export type FlowRunContext = {
  phone: string;
  link: PhoneLink | null;   // guest flows run with null and CREATE the link on completion
  personId?: string;
  session: WhatsAppSession;
};
```

**1b. New output variant** for the leader → web-onboarding link:
```ts
export type FlowOutput =
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; header?: string; buttons: Array<{ id: string; title: string }> }
  | { type: "list"; text: string; header?: string; buttonLabel: string; rows: Array<{ id: string; title: string; description?: string }> }
  | { type: "urlButton"; text: string; url: string; buttonLabel: string };   // NEW
```

Nothing else in the engine changes (`startFlow`, `advanceFlow`, `Transition`, cancel words all stay).

**1c. Guard the child flow for the nullable type** — in `src/lib/services/flows/child-checkin.ts`, at the top of the `confirm` step's commit (before using `ctx.link.workspaceId`):
```ts
if (!ctx.link) return { done: { type: "text", text: "Please connect to your church first, then I can check your child in." } };
```
(In practice child-checkin only starts for linked members, but the type is now nullable.)

---

## Task 2 — The guest-connect flow (`src/lib/services/flows/guest-connect.ts`)

Steps: `who_are_you` → (`ask_name` if unknown) → `connect_code` → `confirm` → **done (member menu)**. The leader branch ends immediately with the web-onboarding link.

Reuse these existing, real functions (do not reimplement):
- `findWorkspaceByJoinCode(code)` and `findWorkspaceByUsername(username)` from `@/lib/services/whatsapp-workspace` — both return `{ id; slug; name; city } | null`.
- `provisionPersonMembership({ phoneNumber, fullName, workspaceId, workspaceSlug, workspaceName, role })` from `@/lib/services/identity/provisioning`.
- `startSignupFlow(phoneNumber)` from `@/lib/services/onboarding-flow` — returns `{ text; url: string | null }` (the secure web-onboarding link).
- `menuForRole(role, page)` from `@/lib/services/agent/menu` — returns the member menu rows (`{ id: "menu:…"; title; description }`).

```ts
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { findWorkspaceByJoinCode, findWorkspaceByUsername } from "@/lib/services/whatsapp-workspace";
import { provisionPersonMembership } from "@/lib/services/identity/provisioning";
import { startSignupFlow } from "@/lib/services/onboarding-flow";
import { menuForRole } from "@/lib/services/agent/menu";
import { updateSession } from "@/lib/services/whatsapp-session";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}

// A code (8 alphanumerics) or an @username / bare handle (3–20).
function parseIdentifier(text: string): { code?: string; username?: string } | null {
  const t = text.trim().replace(/^join[\s-]?/i, "");
  if (/^[a-z0-9]{8}$/i.test(t)) return { code: t };
  const u = t.replace(/^@/, "");
  if (/^[a-z0-9_]{3,20}$/i.test(u)) return { username: u };
  return null;
}

async function lookupChurch(text: string) {
  const id = parseIdentifier(text);
  if (!id) return null;
  if (id.code) {
    const byCode = await findWorkspaceByJoinCode(id.code);
    if (byCode) return byCode;
  }
  if (id.username) return findWorkspaceByUsername(id.username);
  return null;
}

export const guestConnectFlow: FlowDefinition = {
  name: "guest_connect",
  firstStep: "who_are_you",
  steps: {
    who_are_you: {
      render: () => ({
        type: "buttons",
        header: "Welcome to Chertt 👋",
        text: "So I point you the right way — who are you?",
        buttons: [
          { id: "who_attend", title: "I attend a church" },
          { id: "who_child", title: "Here for my child" },
          { id: "who_lead", title: "I lead a church" },
        ],
      }),
      onInput: async (input: FlowInput, data: FlowData, ctx: FlowRunContext): Promise<Transition> => {
        if (input.buttonId === "who_lead") {
          const { text, url } = await startSignupFlow(ctx.phone);
          if (url) return { done: { type: "urlButton", text, url, buttonLabel: "Verify my church" } };
          return { done: { type: "text", text } };
        }
        if (input.buttonId === "who_attend" || input.buttonId === "who_child") {
          const intent = input.buttonId === "who_child" ? "child" : "attend";
          const known = ctx.session.userName?.trim();
          if (known) return { to: "connect_code", patch: { intent, fullName: known } };
          return { to: "ask_name", patch: { intent } };
        }
        // typed something instead of tapping — nudge, stay
        return { stay: {
          type: "buttons",
          header: "Welcome to Chertt 👋",
          text: "Tap one so I can point you the right way 👇",
          buttons: [
            { id: "who_attend", title: "I attend a church" },
            { id: "who_child", title: "Here for my child" },
            { id: "who_lead", title: "I lead a church" },
          ],
        } };
      },
    },

    ask_name: {
      render: () => ({ type: "text", text: "Lovely 🙏 What's your name?" }),
      onInput: (input): Transition => {
        const name = input.text.trim();
        if (!looksLikeName(name)) return { stay: { type: "text", text: "Just your name, please — first and last is perfect." } };
        return { to: "connect_code", patch: { fullName: name } };
      },
    },

    connect_code: {
      render: (data) => ({
        type: "text",
        text: `Thanks${data.fullName ? ", " + String(data.fullName).split(" ")[0] : ""}! What's your church's *code*? Send it here — it's the short code or @username your church shares.\n\n_Don't have it? Ask a church leader — they can send it to you._`,
      }),
      onInput: async (input): Promise<Transition> => {
        const church = await lookupChurch(input.text);
        if (!church) {
          return { stay: { type: "text", text: "Hmm, I couldn't find a church with that code. Double-check it with your church, and send it again." } };
        }
        return { to: "confirm", patch: { workspaceId: church.id, workspaceSlug: church.slug, workspaceName: church.name, workspaceCity: church.city ?? "" } };
      },
    },

    confirm: {
      render: (data) => {
        const city = data.workspaceCity ? `, ${String(data.workspaceCity)}` : "";
        return {
          type: "buttons",
          header: "Connect to church",
          text: `That's *${String(data.workspaceName)}*${city}. Shall I connect you?`,
          buttons: [
            { id: "connect_yes", title: "✅ Yes, connect me" },
            { id: "connect_no", title: "❌ No" },
          ],
        };
      },
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "connect_no") {
          return { to: "connect_code", patch: { workspaceId: undefined, workspaceName: undefined, workspaceCity: undefined } };
        }
        if (input.buttonId !== "connect_yes" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return { stay: {
            type: "buttons", header: "Connect to church",
            text: `Tap *Yes* to connect to *${String(data.workspaceName)}*, or *No* to try another code.`,
            buttons: [{ id: "connect_yes", title: "✅ Yes, connect me" }, { id: "connect_no", title: "❌ No" }],
          } };
        }
        const fullName = String(data.fullName ?? ctx.session.userName ?? "");
        await provisionPersonMembership({
          phoneNumber: ctx.phone,
          fullName,
          workspaceId: String(data.workspaceId),
          workspaceSlug: String(data.workspaceSlug),
          workspaceName: String(data.workspaceName),
          role: "member",
        });
        // Remember the name so we never ask again.
        if (fullName) await updateSession(ctx.phone, { userName: fullName });
        // Land them straight in the member menu — the journey completes here.
        const rows = menuForRole("member", 1);
        return { done: {
          type: "list",
          header: String(data.workspaceName),
          text: `🎉 You're connected to *${String(data.workspaceName)}*! What do you need?`,
          buttonLabel: "Open menu",
          rows,
        } };
      },
    },
  },
};
```

Register it in `src/lib/services/flows/index.ts`:
```ts
import { registerFlow } from "@/lib/services/flows/engine";
import { childCheckinFlow } from "@/lib/services/flows/child-checkin";
import { guestConnectFlow } from "@/lib/services/flows/guest-connect";

registerFlow(childCheckinFlow);
registerFlow(guestConnectFlow);
```

---

## Task 3 — Processor wiring (`src/lib/services/whatsapp-processor.ts`)

**3a. Render the new `urlButton` output.** In `sendFlowOutput`, add a branch (uses the existing `sendUrlButton` import already in this file):
```ts
if (out.type === "urlButton") {
  try { await sendUrlButton(from, out.text, out.url, out.buttonLabel); return; }
  catch { await sendTextMessage(from, `${out.text}\n\n${out.url}`); return; }
}
```

**3b. Move the in-flow advance block EARLIER, and make it guest-capable.** Right now the block sits after the onboarding-advance block and is gated on `link &&`. A guest flow has no link, and an active rail must win over the ad-hoc code matchers. So:

1. **Delete** the existing `if (link && session.activeFlow …)` block from its current location (right before `if (type === "interactive" && message.buttonReplyId)`).
2. **Re-insert** it **immediately after the `#reset` block** (the `if (trimmed.toLowerCase() === "#reset")` that returns) and **before** the "Member join-by-code" block — with the `link &&` gate removed:

```ts
// ── In-progress task flow (flow engine) ──
// An active rail owns the turn — text OR button tap — for members AND guests,
// so it wins over the ad-hoc join-code / admin-claim matchers below. Global
// guards that must always win (message-claim, welcome/consent, risk triage,
// #reset, platform admin, multi-church disambiguation) all return above this.
// Opt-out keywords still escape (they fall through to the handler below).
if (session.activeFlow && !/^(stop|unsubscribe|remove me)$/i.test(trimmed)) {
  const runCtx = { phone: from, link, personId: personId ?? undefined, session };
  const input = { text: trimmed, buttonId: message.buttonReplyId };
  const out = await advanceFlow(input, runCtx, (patch) => updateSession(from, patch));
  if (out) {
    await addToHistory(from, "user", message.buttonReplyId ? `[tap] ${message.buttonReplyId}` : trimmed);
    await sendFlowOutput(from, out);
    return;
  }
}
```

(`#reset` is above and returns, so it can never be swallowed. `stop`/`unsubscribe` are excluded so the opt-out still works mid-flow.)

**3c. Start the guest rail after consent.** Replace the two guest entry points that currently call `sendGuestWelcome` with a `startFlow("guest_connect", …)`:

- **Button consent** — in `handleButtonReply`, the `guest_consent` case: change `await sendGuestWelcome(from);` to:
  ```ts
  const out = await startFlow("guest_connect", { phone: from, link: null, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
  if (out) { await sendFlowOutput(from, out); return; }
  await sendGuestWelcome(from); // fallback if the flow failed to start
  return;
  ```
- **Typed "I agree"** — in the main handler (`if (!link && /^(i\s*)?agree…/.test(trimmed))`): same replacement (record consent, then `startFlow` with fallback to `sendGuestWelcome`).

- **Guest "menu"/"how does this work"** — the `if (!link && (MENU_RE.test(trimmed) || GUEST_LOST_RE.test(trimmed)))` line currently calls `sendGuestWelcome`. Change it to (re)start the rail:
  ```ts
  if (!link && (MENU_RE.test(trimmed) || GUEST_LOST_RE.test(trimmed))) {
    const out = await startFlow("guest_connect", { phone: from, link: null, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
    await sendGuestWelcome(from); return;
  }
  ```

Do **not** change the first-contact consent gate itself (`if (!session.welcomed) { … sendConsentGate … }`) — consent still comes first; the rail starts the moment they agree.

**Note on precedence:** because the guest rail's `who_are_you` buttons use flow-scoped ids (`who_attend`/`who_child`/`who_lead`) and the advance block is now above `handleButtonReply`, those taps route to the engine, never to the old `guest_*` handlers. The old handlers stay as dead-but-harmless code.

---

## Task 4 — Tests

**`src/lib/services/flows/guest-connect.test.ts`** (mock the workspace + provisioning modules, mirroring `child-checkin.test.ts`):
- **Attend happy path:** `who_attend` (no `userName` in session) → `ask_name` "Ada" → `connect_code` "GRACE001" (mock `findWorkspaceByJoinCode` → Grace Chapel) → `confirm` `connect_yes` → asserts `provisionPersonMembership` called with `{ phoneNumber, fullName: "Ada", workspaceId, role: "member" }` and the `done` output is a `list` whose text names Grace Chapel.
- **Name skipped when known:** session already has `userName` → `who_attend` transitions straight to `connect_code` (no `ask_name`).
- **Bad code reprompts:** `findWorkspaceByJoinCode` and `findWorkspaceByUsername` both return null → `connect_code` returns a `stay` and stays on the step.
- **@username path:** `connect_code` "@gracechapel" → `findWorkspaceByUsername` hit → confirm.
- **Confirm "No" → back to code:** `connect_no` returns to `connect_code` with the workspace fields cleared.
- **Leader branch:** `who_lead` → mock `startSignupFlow` → `{ text, url }` → `done` is a `urlButton` output carrying that url; `provisionPersonMembership` NOT called.

**`src/lib/services/whatsapp-processor.test.ts`** (extend, following the existing harness):
- After a guest taps `guest_consent`, the session has `activeFlow.name === "guest_connect"` and a who-are-you buttons message is sent.
- A guest mid-`guest_connect` who taps `who_attend` advances the flow (not routed to the old `guest_member` handler).
- `#reset` still wins over an active `guest_connect` flow (clears it).

---

## Verification & handback

- Run `npm run typecheck`, `npm run lint`, and `npx vitest run` — all green, real output pasted back. The child-checkin tests from Prompt 1 must still pass unchanged.
- Manual WhatsApp path (after Vercel "Ready"), with seed data loaded (`GRACE001` = Grace Chapel Assembly):
  `#reset` → `Hi` → **✅ I agree** → **I attend a church** → type `Ada` → send `GRACE001` → **✅ Yes, connect me** → land on the member menu → tap **👶 Check in a child** → the Prompt 1 rail runs. Typing `menu` mid-flow exits politely.
- Report: files changed, real test output, and confirm the child-checkin flow + agent + onboarding paths are behaviourally unchanged.

## Guardrails recap

- Engine stays pure; only the nullable-link + `urlButton` additions.
- The guest rail creates the membership via the **real** `provisionPersonMembership`; it looks up churches via the **real** `findWorkspaceByJoinCode`/`findWorkspaceByUsername`.
- Safety order preserved: claim → welcome/consent → risk triage → `#reset` → **flow engine** → join-code matchers → platform admin → … → agent.
- No Give/Prayer/Join, no church-name search, no AI removal — those are later prompts.
