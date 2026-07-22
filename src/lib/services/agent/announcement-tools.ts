// Church announcements: an admin broadcasts a message to all members.
// Admin-only and confirmation-gated. NOTE on delivery: WhatsApp only allows
// free-form business-initiated messages inside a 24h session window; members
// who haven't messaged recently need a pre-approved template. This sends
// free-form text (reaches recently-active members and counts successes); wiring
// an approved broadcast template is the follow-up for reliable cold delivery.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { sendTextMessage } from "@/lib/services/whatsapp";
import { listWorkspaceMemberPhones } from "@/lib/services/identity/provisioning";
import { roleRank } from "@/lib/services/identity/role-catalog";
import type { AgentTool } from "@/lib/services/agent/tools";

// Only branch-lead-level roles and above may broadcast (manager/pastor/admin/
// owner/senior_pastor) — a member must never be able to message everyone.
const BROADCAST_MIN_RANK = 4;

export const ANNOUNCEMENT_TOOLS: AgentTool[] = [
  {
    name: "create_announcement",
    description:
      "Broadcast an announcement to all members of this church. Only admins/pastors can send, and it is confirmed before going out.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short headline" },
        message: { type: "string", description: "The announcement body" },
      },
      required: ["title", "message"],
    },
    requiresConfirmation: true,
    minRank: 4, // admins/pastors only (also enforced inline below, defense in depth)
    mutates: true,
    preview: (args) => `📢 Send this announcement to all members: *${String(args.title ?? "")}*?`,
    handler: async (args, ctx) => {
      if (roleRank(ctx.role) < BROADCAST_MIN_RANK) {
        return { error: "Only church admins can send announcements." };
      }
      const title = String(args.title ?? "").trim();
      const body = String(args.message ?? "").trim();
      if (!title || !body) return { error: "Need a title and a message." };

      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      const phones = await listWorkspaceMemberPhones(ctx.workspaceId);
      const text = `📢 *${title}*\n\n${body}`;
      const results = await Promise.allSettled(phones.map((p) => sendTextMessage(p, text)));
      const delivered = results.filter((r) => r.status === "fulfilled").length;

      // ── Reliable cold delivery (ACTIVATE with an approved template) ──
      // The free-form send above only reaches members inside their 24h WhatsApp
      // session window. Once WHATSAPP_TEMPLATE_ANNOUNCEMENT is approved (see
      // whatsapp-templates.ts), swap the send above for the template so members
      // who haven't messaged recently also receive it:
      //
      //   import { sendAnnouncementTemplate } from "@/lib/services/whatsapp-templates";
      //   const results = await Promise.allSettled(
      //     phones.map((p) => sendAnnouncementTemplate(p, title, body)),
      //   );

      await db.from("announcements").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        title,
        body,
        sent_by: ctx.userName ?? "",
        recipient_count: delivered,
      });

      return { ok: true, message: `📢 Announcement sent to ${delivered} member${delivered !== 1 ? "s" : ""}.` };
    },
  },
  {
    name: "list_announcements",
    description: "Recent announcements sent in this church.",
    parameters: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, announcements: [] };
      const { data } = await db
        .from("announcements")
        .select("title, body, sent_by, recipient_count, created_at")
        .eq("workspace_id", ctx.workspaceId)
        .order("created_at", { ascending: false })
        .limit(10);
      const announcements = (data ?? []).map((r) => {
        const row = r as { title?: string; body?: string; recipient_count?: number };
        return { title: row.title ?? "", body: row.body ?? "", recipients: row.recipient_count ?? 0 };
      });
      return { count: announcements.length, announcements };
    },
  },
];
