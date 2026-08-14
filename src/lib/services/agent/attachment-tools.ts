// WS-A tools: the AI references REAL stored attachments. save_attachment only
// confirms what actually reached the bucket — never claims a phantom save.
// list_attachments is leaders-only and data-sensitive.

import type { AgentTool } from "@/lib/services/agent/tools";
import { latestUnconfirmedAttachment, confirmAttachment, listPersonAttachments, signedAttachmentUrl } from "@/lib/services/chat-attachments";

export const ATTACHMENT_TOOLS: AgentTool[] = [
  {
    name: "save_attachment",
    description:
      "Confirm that an attachment the person just sent (photo, voice note or document) is saved to their record. Use when someone says 'save this', 'keep this', 'add this photo to my file', or asks you to store what they sent. NEVER claim something is saved unless this tool confirms a real stored attachment exists.",
    parameters: {
      type: "object",
      properties: {
        caption: { type: "string", description: "Optional short description of the attachment" },
      },
    },
    mutates: true,
    handler: async (args, ctx) => {
      if (!ctx.personId) return { error: "I can't find your member record yet — reply once more and I'll sort it out." };
      const latest = await latestUnconfirmedAttachment(ctx.personId);
      if (!latest) {
        return {
          error:
            "I don't have a recent attachment from you on file. Please send the photo, voice note or document again, then ask me to save it.",
        };
      }
      const caption = String(args.caption ?? "").trim() || latest.caption || `${latest.kind} from ${ctx.userName ?? "member"}`;
      const ok = await confirmAttachment(latest.id, caption);
      if (!ok) return { error: "I couldn't save that just now — please try again." };
      return { ok: true, message: `✅ Saved to your record: "${caption}".` };
    },
  },
  {
    name: "list_attachments",
    description:
      "List the files (photos, documents, voice notes) stored on a person's record. Leaders use this to see what's on file for a member.",
    parameters: {
      type: "object",
      properties: {
        personId: { type: "string", description: "The person's id (omit for the current member)" },
      },
    },
    minRank: 1,
    dataSensitive: true,
    handler: async (args, ctx) => {
      const target = String(args.personId ?? "").trim() || ctx.personId;
      if (!target) return { error: "Tell me whose files to look up." };
      const rows = await listPersonAttachments(target);
      if (rows.length === 0) return { files: [], message: "Nothing on file for them yet." };
      const files = await Promise.all(
        rows.map(async (r) => ({
          kind: r.kind,
          caption: r.caption,
          confirmed: !!r.confirmedAt,
          createdAt: r.createdAt,
          url: await signedAttachmentUrl(r.storagePath),
        })),
      );
      return { files, message: `${files.length} file(s) on file.` };
    },
  },
];
