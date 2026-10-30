// The direction rail — one consistent "where am I / what next" frame around
// every module (UAT 2026-10: "I can't get past the start", "no clear direction
// on what to do", "no menu of what the app can do").
//
//  • OPEN: every flow starts with a one-line header saying what the module does
//    and how to leave (withIntro — applied by the engine in startFlow).
//  • END: every stop offers a way forward — the flow's own next-step buttons
//    plus "🏠 Main menu" (withWayBack — applied when a finished flow, a read, a
//    cancel or a refusal is rendered to WhatsApp). Never a dead-end.
//
// Pure functions over FlowOutput; no WhatsApp calls here.
import type { FlowOutput } from "@/lib/services/flows/engine";

// The universal way back. `main_menu` is handled by the processor for members
// (role-aware menu) and guests (the connect front door) alike, and it also
// works as an escape mid-flow.
export const MENU_BUTTON = { id: "main_menu", title: "🏠 Main menu" } as const;
export const MENU_ROW = { id: "main_menu", title: "🏠 Main menu", description: "Everything Chertt can do for you" } as const;

// Shown under every module header.
export const EXIT_HINT = "_Type *menu* anytime to stop._";

// Plain-text way back when buttons can't be added (no room, or too long for an
// interactive body).
export const MENU_HINT = "_Type *menu* to see everything else I can do._";

// WhatsApp caps: interactive body 1024 chars, 3 reply buttons, 10 list rows.
const MAX_INTERACTIVE_BODY = 1000;
const MAX_BUTTONS = 3;
const MAX_ROWS = 10;
// Row ids that already ARE a way back / onward — don't add another.
const NAV_IDS = new Set(["main_menu", "help_more"]);

function appendText(text: string, extra: string): string {
  return `${text}\n\n${extra}`;
}

/** Prefix a module's opening step with its header + exit hint. */
export function withIntro(intro: string | undefined, out: FlowOutput): FlowOutput {
  if (!intro) return out;
  const head = `${intro}\n${EXIT_HINT}`;
  const text = appendText(head, out.text);
  if (out.type !== "text" && text.length > MAX_INTERACTIVE_BODY) return out; // never break the interactive limit
  return { ...out, text };
}

/**
 * Make sure a stop ends with a clear next move. Adds "🏠 Main menu" as a
 * button (text → buttons) or list row when there's room; otherwise appends a
 * plain "type menu" line. Idempotent: an output that already offers the menu
 * is returned unchanged.
 */
export function withWayBack(o: FlowOutput): FlowOutput {
  if (o.type === "text") {
    if (o.text.length > MAX_INTERACTIVE_BODY) return { ...o, text: appendText(o.text, MENU_HINT) };
    return { type: "buttons", text: appendText(o.text, "What next? 👇"), buttons: [MENU_BUTTON], final: o.final };
  }
  if (o.type === "buttons") {
    if (o.buttons.some((b) => NAV_IDS.has(b.id))) return o;
    if (o.buttons.length < MAX_BUTTONS && o.text.length <= MAX_INTERACTIVE_BODY) {
      return { ...o, buttons: [...o.buttons, MENU_BUTTON] };
    }
    return { ...o, text: appendText(o.text, MENU_HINT) };
  }
  if (o.type === "list") {
    if (o.rows.some((r) => NAV_IDS.has(r.id))) return o;
    if (o.rows.length < MAX_ROWS) return { ...o, rows: [...o.rows, MENU_ROW] };
    return { ...o, text: appendText(o.text, MENU_HINT) };
  }
  // urlButton: the one button is the link itself — say how to get back.
  return { ...o, text: appendText(o.text, MENU_HINT) };
}
