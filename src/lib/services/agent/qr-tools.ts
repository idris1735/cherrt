// Conversational QR: let anyone pull a scannable QR image straight into the
// chat to save or forward — inviting members, giving, parking, kids' check-in,
// prayer or events. Reuses the /qr/img endpoint and the same presets the web
// posters use, so "send me the join QR" delivers the identical code as a poster.
// See docs/superpowers/specs/2026-07-25-qr-codes-design.md
import { sendImageMessage } from "@/lib/services/whatsapp";
import { resolvePoster, type PosterParams } from "@/lib/services/qr/qr";
import type { AgentTool } from "@/lib/services/agent/tools";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://cherrt.vercel.app").replace(/\/$/, "");
}

export const QR_TOOLS: AgentTool[] = [
  {
    name: "send_qr",
    description:
      "Send a scannable QR code image into this chat that the person can save or forward. Use when someone asks to 'send/share the QR', 'invite link', 'join code', 'QR to invite members', or a QR for giving, parking, kids' check-in, prayer or events.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "Which QR: join (invite people), give, kids, parking, prayer, or events. Defaults to join.",
        },
      },
    },
    mutates: true, // sends a message
    handler: async (args, ctx) => {
      if (!ctx.phone) return { error: "I can only send the QR into a WhatsApp chat." };
      const kind = String(args.kind ?? "join").trim().toLowerCase() || "join";
      const poster = resolvePoster({ preset: kind } as PosterParams);
      const url = `${appUrl()}/qr/img?preset=${encodeURIComponent(kind)}`;
      try {
        await sendImageMessage(ctx.phone, url, `${poster.title} — scan or forward to share. 📲`);
      } catch {
        return { error: "Couldn't send the QR just now — please try again." };
      }
      return { ok: true, message: `Sent! 📲 Forward it to anyone — ${poster.subtitle.toLowerCase()}` };
    },
  },
];
