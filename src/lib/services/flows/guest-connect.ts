// Guest → connect-to-church rail — the whole front door, on the engine.
// who are you → (name once) → church code/@username → confirm → member menu.
// A church leader takes the web-onboarding branch and gets the secure link.
//
// Uses the REAL connect logic — findWorkspaceByJoinCode / findWorkspaceByUsername /
// provisionPersonMembership — nothing reimplemented, just on rails.
import type { FlowDefinition, FlowInput, FlowData, FlowRunContext, Transition } from "@/lib/services/flows/engine";
import { findWorkspaceByJoinCode, findWorkspaceByUsername, findWorkspacesByName, isWorkspaceSubscriptionActive } from "@/lib/services/whatsapp-workspace";
import { provisionPersonMembership } from "@/lib/services/identity/provisioning";
import { startSignupFlow } from "@/lib/services/onboarding-flow";
import { menuForRole } from "@/lib/services/agent/menu";
import { updateSession } from "@/lib/services/whatsapp-session";

function looksLikeName(s: string): boolean {
  const t = s.trim();
  return t.length >= 2 && /[a-z]/i.test(t) && !/^\d+$/.test(t);
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
  };
}

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
      render: () => ({ type: "text", text: "Lovely 🙏 What's your name?" }),
      onInput: (input): Transition => {
        const name = input.text.trim();
        if (!looksLikeName(name)) return { stay: { type: "text", text: "Just your name, please — first and last is perfect." } };
        return { to: "ask_email", patch: { fullName: name } };
      },
    },

    // Basic bio, Kola's onboarding step: capture email once, on first connect.
    // Never re-asked (a returning/known-name member skips straight to the code),
    // and Skip is always available so it never walls the front door.
    ask_email: {
      render: (data) => ({
        type: "buttons",
        header: "Almost there",
        text: `Thanks${data.fullName ? ", " + String(data.fullName).split(" ")[0] : ""}! What's your *email*? Your church uses it for receipts and updates.`,
        buttons: EMAIL_SKIP,
      }),
      onInput: (input): Transition => {
        if (input.buttonId === "email_skip") return { to: "connect_code" };
        const email = input.text.trim();
        if (!looksLikeEmail(email)) {
          return {
            stay: {
              type: "buttons",
              header: "Almost there",
              text: "Hmm, that doesn't look like an email. Send it again, or tap *Skip for now*.",
              buttons: EMAIL_SKIP,
            },
          };
        }
        return { to: "connect_code", patch: { email } };
      },
    },

    connect_code: {
      render: (data) => ({
        type: "text",
        text: `Thanks${data.fullName ? ", " + String(data.fullName).split(" ")[0] : ""}! What's your church's *code*? Send it here — it's the short code or @username your church shares.\n\n_Don't have it? Ask a church leader — they can send it to you._`,
      }),
      onInput: async (input): Promise<Transition> => {
        const church = await lookupChurch(input.text);
        if (church) {
          return { to: "confirm", patch: churchPatch(church) };
        }
        // P3-A: no code/@username hit — try the church's NAME too (sentence-aware).
        const matches = await findWorkspacesByName(input.text);
        if (matches.length === 1) {
          return { to: "confirm", patch: churchPatch(matches[0]) };
        }
        if (matches.length > 1) {
          return { to: "pick_church", patch: { candidates: matches } };
        }
        return { stay: { type: "text", text: "Hmm, I couldn't find that — send your church's *code* or `@username`, or type the church's name again." } };
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
          return {
            to: "connect_code",
            patch: {
              workspaceId: undefined, workspaceSlug: undefined, workspaceName: undefined,
              workspaceCity: undefined, workspaceState: undefined,
              workspaceUsername: undefined, workspaceWebsite: undefined,
            },
          };
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
        // anyone into a church that isn't active. Clean exit if it isn't.
        const active = await isWorkspaceSubscriptionActive(String(data.workspaceId));
        if (!active) {
          return {
            done: {
              type: "text",
              text: `*${String(data.workspaceName)}* isn't active on Chertt right now, so I can't connect you yet. Please check with a church leader. 🙏`,
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
        // Land them straight in the member menu — the journey completes here.
        const rows = menuForRole("member", 1);
        return {
          done: {
            type: "list",
            header: String(data.workspaceName),
            text: `🎉 You're connected to *${String(data.workspaceName)}*! What do you need?`,
            buttonLabel: "Open menu",
            rows,
          },
        };
      },
    },
  },
};
