// Guest → connect-to-church rail — the whole front door, on the engine.
// who are you → (name once) → church code/@username → confirm → member menu.
// A church leader takes the web-onboarding branch and gets the secure link.
//
// Uses the REAL connect logic — findWorkspaceByJoinCode / findWorkspaceByUsername /
// provisionPersonMembership — nothing reimplemented, just on rails.
//
// Direction rail (UAT 2026-10): each question says which step it is ("Step 1 of
// 3 · Your name"), and the name step makes plain it wants the PERSON's name, not
// the church's — testers who tapped "I attend a church" typed their church's
// name there. If they do anyway, we keep it as a hint and offer it at the church
// step instead of saving it as their name.
import type { FlowDefinition, FlowInput, FlowData, FlowOutput, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { findWorkspaceByJoinCode, findWorkspaceByUsername, findWorkspacesByName, isWorkspaceSubscriptionActive } from "@/lib/services/whatsapp-workspace";
import { provisionPersonMembership } from "@/lib/services/identity/provisioning";
import { startMemberEmailVerification } from "@/lib/services/identity/email-verify";
import { startSignupFlow } from "@/lib/services/onboarding-flow";
import { mainMenuRows } from "@/lib/services/agent/menu";
import { updateSession } from "@/lib/services/whatsapp-session";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
}

// "Flow of questions" (UAT 22 Oct): at the name step people typed their
// CHURCH. Catch the obvious shapes — a church word, a join code (8 chars with a
// digit), or an @username — so we never save "Grace Chapel" as a person's name.
const CHURCH_WORD_RE = /\b(church|chapel|assembl(y|ies)|cathedral|parish|tabernacle|ministr(y|ies)|fellowship|cent(re|er)|temple|sanctuary|mission|rccg|mfm|winners|deeper life|baptist|anglican|catholic|methodist|presbyterian|pentecostal|redeemed|christ embassy|living faith|house of|gospel|bible|evangelical|international|hq)\b/i;
export function looksLikeChurch(s: string): boolean {
  const t = s.trim();
  if (/^@[a-z0-9_]{3,20}$/i.test(t)) return true;
  if (/^(join[\s-]?)?[a-z0-9]{8}$/i.test(t) && /\d/.test(t)) return true;
  return CHURCH_WORD_RE.test(t);
}

// Deliberately lenient — enough to catch fat-finger typos, not to police RFC
// 5322. The point is a usable email, and Skip is always one tap away.
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

const EMAIL_SKIP = [{ id: "email_skip", title: "Skip for now" }];

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

// One place that maps a resolved church → the confirm-screen fields, so a code
// hit, a single name hit, and a picked list row all carry the same detail.
function churchPatch(m: {
  id: string; slug: string; name: string;
  city?: string | null; state?: string | null; username?: string | null; website?: string | null;
}): FlowData {
  return {
    workspaceId: m.id,
    workspaceSlug: m.slug,
    workspaceName: m.name,
    workspaceCity: m.city ?? "",
    workspaceState: m.state ?? "",
    workspaceUsername: m.username ?? "",
    workspaceWebsite: m.website ?? "",
    // A resolved church consumes any hint / notice from earlier turns.
    churchHint: undefined,
    notice: undefined,
  };
}

const CLEAR_CHURCH: FlowData = {
  workspaceId: undefined, workspaceSlug: undefined, workspaceName: undefined,
  workspaceCity: undefined, workspaceState: undefined,
  workspaceUsername: undefined, workspaceWebsite: undefined,
};

// The identifying lines under the church name on the confirm screen — city ·
// state, @handle, website — only the ones we actually have.
function churchDetailLines(data: FlowData): string {
  const lines: string[] = [];
  const loc = [data.workspaceCity, data.workspaceState].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  if (loc) lines.push(`📍 ${loc}`);
  if (data.workspaceUsername) lines.push(`🔗 @${String(data.workspaceUsername)}`);
  if (data.workspaceWebsite) lines.push(`🌐 ${String(data.workspaceWebsite)}`);
  return lines.length ? "\n" + lines.join("\n") : "";
}

const firstName = (data: FlowData) => (data.fullName ? String(data.fullName).split(" ")[0] : "");

// Code → name search → one / several / none. Shared by a typed answer and the
// "use the church you mentioned" tap.
async function resolveChurch(text: string): Promise<Transition> {
  const church = await lookupChurch(text);
  if (church) return { to: "confirm", patch: churchPatch(church) };
  // P3-A: no code/@username hit — try the church's NAME too (sentence-aware).
  const matches = await findWorkspacesByName(text);
  if (matches.length === 1) return { to: "confirm", patch: churchPatch(matches[0]) };
  if (matches.length > 1) return { to: "pick_church", patch: { candidates: matches, churchHint: undefined, notice: undefined } };
  return {
    stay: {
      type: "text",
      text: "Hmm, I couldn't find that — send your church's *code* or `@username`, or type the church's name again.\n\n_No code? Ask a church leader for it, or type *menu* to stop._",
    },
  };
}

function askNameOutput(data: FlowData): FlowOutput {
  const lead = data.churchHint
    ? `That sounds like your *church* — great, I'll use it in step 3. 🙂\n\nFirst, *your own* name please.`
    : "Lovely 🙏 Let's connect you to your church — 3 quick steps.";
  return {
    type: "text",
    text: `${lead}\n\n*Step 1 of 3 · Your name*\nWhat's *your* full name? (e.g. _Ada Okafor_)\n\n_Not your church's name — I'll ask for your church in step 3._`,
  };
}

export const guestConnectFlow: FlowDefinition = {
  name: "guest_connect",
  intro: "👋 *Chertt* is your church on WhatsApp — give, ask for prayer, check kids in, join a ministry, see events and more.",
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
          if (known) return { to: "connect_code", patch: { intent, fullName: known, knownName: true } };
          return { to: "ask_name", patch: { intent } };
        }
        // Typed something instead of tapping — nudge, stay.
        return {
          stay: {
            type: "buttons",
            header: "Welcome to Chertt 👋",
            text: "Tap one so I can point you the right way 👇",
            buttons: [
              { id: "who_attend", title: "I attend a church" },
              { id: "who_child", title: "Here for my child" },
              { id: "who_lead", title: "I lead a church" },
            ],
          },
        };
      },
    },

    ask_name: {
      render: (data) => askNameOutput(data),
      onInput: (input, data): Transition => {
        // A tap on an older button (its title arrives as text) is never a name.
        if (input.buttonId) return { stay: askNameOutput(data) };
        const name = input.text.trim().replace(/\s+/g, " ");
        // They typed their church here — keep it for step 3, ask again for THEIR name.
        if (looksLikeChurch(name)) return { to: "ask_name", patch: { churchHint: name } };
        if (!looksLikeName(name)) return { stay: { type: "text", text: "Just *your own* name, please 🙏 (e.g. _Ada Okafor_)" } };
        // The church wants your full name — nudge once for a surname if we only
        // got one word. ask_surname combines them (and never walls a one-name member).
        if (name.split(" ").length < 2) return { to: "ask_surname", patch: { firstName: name } };
        return { to: "ask_email", patch: { fullName: name } };
      },
    },

    ask_surname: {
      render: (data) => ({ type: "text", text: `Thanks, ${String(data.firstName ?? "")} 🙏 And your *surname* (last name)?` }),
      onInput: (input, data): Transition => {
        const surname = input.text.trim().replace(/\s+/g, " ");
        if (input.buttonId) return { stay: { type: "text", text: "Just type your *surname* (last name), please 🙏" } };
        if (looksLikeChurch(surname)) {
          return { stay: { type: "text", text: "That looks like a church name 🙂 I'll ask for your church in step 3 — for now just *your* surname (last name), please." } };
        }
        const first = String(data.firstName ?? "").trim();
        const fullName = surname ? `${first} ${surname}`.trim() : first;
        if (!looksLikeName(fullName)) return { stay: { type: "text", text: "Your surname, please 🙏" } };
        return { to: "ask_email", patch: { fullName } };
      },
    },

    // Basic bio, Kola's onboarding step: capture email once, on first connect.
    // Never re-asked (a returning/known-name member skips straight to the code),
    // and Skip is always available so it never walls the front door.
    ask_email: {
      render: (data) => ({
        type: "buttons",
        header: "Step 2 of 3 · Email",
        text: `Thanks${firstName(data) ? ", " + firstName(data) : ""}! What's your *email*? Your church uses it for receipts and updates.\n\n_Optional — tap *Skip for now* if you'd rather not._`,
        buttons: EMAIL_SKIP,
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "email_skip") return { to: "connect_code" };
        const email = input.text.trim();
        if (!looksLikeEmail(email)) {
          return {
            stay: {
              type: "buttons",
              header: "Step 2 of 3 · Email",
              text: "Hmm, that doesn't look like an email. Send it again, or tap *Skip for now*.",
              buttons: EMAIL_SKIP,
            },
          };
        }
        return { to: "connect_code", patch: { email } };
      },
    },

    connect_code: {
      render: (data): FlowOutput => {
        const step = data.knownName ? "*Last step · Your church* ⛪" : "*Step 3 of 3 · Your church* ⛪";
        const thanks = `Thanks${firstName(data) ? ", " + firstName(data) : ""}!`;
        const notice = data.notice ? `${String(data.notice)}\n\n` : "";
        // They typed their church at the name step — offer it back, one tap.
        if (data.churchHint) {
          return {
            type: "buttons",
            header: "Your church",
            text: `${notice}${thanks} ${step}\nYou mentioned *${String(data.churchHint)}* — is that your church? Tap below to look it up, or send your church's *code* or *@username*.`,
            buttons: [{ id: "use_hint", title: "✅ Yes, find it" }],
          };
        }
        return {
          type: "text",
          text: `${notice}${thanks} ${step}\nWhat's your church's *code* or *@username*?\n\n_Don't have it? Just type your church's *name* and I'll search for it._`,
        };
      },
      onInput: async (input, data): Promise<Transition> => {
        const useHint = !!data.churchHint && (input.buttonId === "use_hint" || /^(yes|y|yes,? find it)$/i.test(input.text.trim()));
        const query = useHint ? String(data.churchHint) : input.text;
        if (!query.trim()) return { stay: { type: "text", text: "Send your church's *code*, *@username* or *name*." } };
        return resolveChurch(query);
      },
    },

    pick_church: {
      render: (data) => {
        const cands = (data.candidates as Array<{ id: string; name: string; city?: string; state?: string }>) ?? [];
        return {
          type: "list",
          header: "Which church?",
          text: "I found a few — which one is yours?",
          buttonLabel: "Choose",
          rows: cands.map((c, i) => ({
            id: `pick_${i}`,
            title: c.name.slice(0, 24),
            description: [c.city, c.state].map((x) => (x ?? "").trim()).filter(Boolean).join(", "),
          })),
        };
      },
      onInput: (input, data): Transition => {
        const cands = (data.candidates as Array<{ id: string; slug: string; name: string; city?: string; state?: string; username?: string; website?: string }>) ?? [];
        const m = /^pick_(\d+)$/.exec(input.buttonId ?? "");
        const chosen = m ? cands[Number(m[1])] : undefined;
        if (!chosen) {
          return {
            stay: {
              type: "list", header: "Which church?", text: "Tap one of the churches below.",
              buttonLabel: "Choose",
              rows: cands.map((c, i) => ({
                id: `pick_${i}`,
                title: c.name.slice(0, 24),
                description: [c.city, c.state].map((x) => (x ?? "").trim()).filter(Boolean).join(", "),
              })),
            },
          };
        }
        return { to: "confirm", patch: churchPatch(chosen) };
      },
    },

    confirm: {
      render: (data) => ({
        type: "buttons",
        header: "Is this your church?",
        text: `*${String(data.workspaceName)}*${churchDetailLines(data)}\n\nShall I connect you?`,
        buttons: [
          { id: "connect_yes", title: "✅ Yes, that's it" },
          { id: "connect_no", title: "❌ No, not this" },
        ],
      }),
      onInput: async (input, data, ctx): Promise<Transition> => {
        if (input.buttonId === "connect_no") {
          return { to: "connect_code", patch: { ...CLEAR_CHURCH } };
        }
        if (input.buttonId !== "connect_yes" && !/^(yes|y|confirm)$/i.test(input.text.trim())) {
          return {
            stay: {
              type: "buttons",
              header: "Connect to church",
              text: `Tap *Yes* to connect to *${String(data.workspaceName)}*, or *No* to try another code.`,
              buttons: [
                { id: "connect_yes", title: "✅ Yes, connect me" },
                { id: "connect_no", title: "❌ No" },
              ],
            },
          };
        }
        // Subscription gate (Kola's "Verify Church Subscription"): don't connect
        // anyone into a church that isn't active. Not a dead-end: back to the
        // church step (name kept) with the reason, so they can try another.
        const active = await isWorkspaceSubscriptionActive(String(data.workspaceId));
        if (!active) {
          return {
            to: "connect_code",
            patch: {
              ...CLEAR_CHURCH,
              notice: `⚠️ *${String(data.workspaceName)}* isn't active on Chertt right now, so I can't connect you yet — please check with a church leader. 🙏\n\nGot a different church?`,
            },
          };
        }
        const fullName = String(data.fullName ?? ctx.session.userName ?? "");
        await provisionPersonMembership({
          phoneNumber: ctx.phone,
          fullName,
          ...(data.email ? { email: String(data.email) } : {}),
          workspaceId: String(data.workspaceId),
          workspaceSlug: String(data.workspaceSlug),
          workspaceName: String(data.workspaceName),
          role: "member",
        });
        // Remember the name so we never ask again.
        if (fullName) await updateSession(ctx.phone, { userName: fullName });
        // Async, non-blocking email verification: fire a code, tell them how to
        // confirm whenever they like. Never delays landing in the menu.
        let emailNote = "";
        if (data.email) {
          void startMemberEmailVerification(String(data.email));
          emailNote = `\n\n📧 I've emailed a 6-digit code to ${String(data.email)}. Reply *verify [code]* to confirm it's yours — putting the number from that email in place of *[code]* (optional, no rush).`;
        }
        const church = String(data.workspaceName);
        // Came "for my child": the next step is registering the child — offer it first.
        if (data.intent === "child") {
          return {
            done: {
              type: "buttons",
              header: church.slice(0, 60),
              text: `🎉 You're connected to *${church}*!${emailNote}\n\n*Next:* register your child — it takes a minute, then Sunday check-in is one tap.`,
              buttons: [
                { id: "menu:register_child", title: "🧒 Register my child" },
                { id: "main_menu", title: "📋 See all options" },
              ],
            },
          };
        }
        // Land them straight in the member main menu — the journey completes here.
        return {
          done: {
            type: "list",
            header: church.slice(0, 60),
            text: `🎉 You're connected to *${church}*!${emailNote}\n\nHere's everything you can do — pick a section to see its options 👇\n_Type *menu* anytime to come back here._`,
            buttonLabel: "Open menu",
            rows: mainMenuRows("member"),
          },
        };
      },
    },
  },
};
