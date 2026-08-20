// Guest → connect-to-church rail — the whole front door, on the engine.
// who are you → (name once) → church code/@username → confirm → member menu.
// A church leader takes the web-onboarding branch and gets the secure link.
//
// Uses the REAL connect logic — findWorkspaceByJoinCode / findWorkspaceByUsername /
// provisionPersonMembership — nothing reimplemented, just on rails.
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
