// Number migration (admin-assisted): a guest whose number changed files a
// request (their name + old number); a church admin confirms it's them and
// their identity re-attaches to the new number. The request tool runs in the
// GUEST path (no workspace); the review tools run for linked admins.
// See src/lib/services/identity/provisioning.ts (migratePersonPhone).

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { normalizePhoneNumber } from "@/lib/services/phone";
import { migratePersonPhone } from "@/lib/services/identity/provisioning";
import { sendTextMessage } from "@/lib/services/whatsapp";
import type { AgentTool } from "@/lib/services/agent/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */
// A short admin-facing code derived from the request id (same idea as our
// org-approval / join codes — no extra column).
function codeFromId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

// ── Guest side: file the request ──
export const GUEST_MIGRATION_TOOLS: AgentTool[] = [
  {
    name: "request_number_migration",
    description:
      "When someone says they've changed their WhatsApp number and want to reconnect to their church, collect their name and their OLD number (and the church name if they say it), and file this so a church admin can confirm it's them. The new number is the one they're messaging from now.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name they were known by at church" },
        oldNumber: { type: "string", description: "Their previous WhatsApp number" },
        churchName: { type: "string", description: "Their church's name (optional)" },
      },
      required: ["name", "oldNumber"],
    },
    mutates: true, // guest self-service (no minRank — runs in the guest path)
    handler: async (args, ctx) => {
      const newPhone = ctx.phone;
      if (!newPhone) return { error: "I couldn't read your number just now — please try again." };
      const name = String(args.name ?? "").trim();
      const oldNumber = normalizePhoneNumber(String(args.oldNumber ?? ""));
      if (!name) return { error: "What name were you known by at your church?" };
      if (!oldNumber) return { error: "What was your old number? It helps your church find you." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      // Resolve the person + church from the old number (precise + secure).
      let personId: string | null = null;
      let workspaceId: string | null = null;
      const { data: contact } = await db
        .from("phone_contacts")
        .select("person_id")
        .eq("phone_number", oldNumber)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if ((contact as any)?.person_id) {
        personId = (contact as any).person_id;
        const { data: mem } = await db
          .from("branch_memberships")
          .select("workspace_id")
          .eq("person_id", personId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        workspaceId = (mem as any)?.workspace_id ?? null;
      }

      const { error } = await db.from("number_migration_requests").insert({
        id: randomUUID(),
        new_phone: newPhone,
        claimed_name: name,
        claimed_old_phone: oldNumber,
        claimed_church: String(args.churchName ?? "") || null,
        workspace_id: workspaceId,
        person_id: personId,
        status: "pending",
      });
      if (error) return { error: error.message };

      return personId
        ? { ok: true, message: `Thanks, ${name}! 🙏 I've asked your church's admins to reconnect you to this new number. Once they confirm it's you, everything — your history and all — comes right back.` }
        : { ok: true, message: `Thanks, ${name}. I couldn't immediately match that old number — please double-check it, or ask a church admin to reconnect you directly. Your records are safe.` };
    },
  },
];

// ── Admin side: review & approve ──
export const ADMIN_MIGRATION_TOOLS: AgentTool[] = [
  {
    name: "list_migration_requests",
    description: "Pending number-migration requests for this church — people asking to reconnect a changed number. Each has a code to approve.",
    parameters: { type: "object", properties: {} },
    minRank: 4, // admins / pastors
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, requests: [] };
      const { data } = await db
        .from("number_migration_requests")
        .select("id, claimed_name, claimed_old_phone, new_phone, person_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      const requests = (data ?? []).map((r: any) => ({
        code: codeFromId(r.id),
        name: r.claimed_name,
        oldNumber: r.claimed_old_phone,
        newNumber: r.new_phone,
        matched: !!r.person_id,
      }));
      return { count: requests.length, requests };
    },
  },
  {
    name: "approve_number_migration",
    description: "Approve a pending number-migration request by its code, after confirming it's really them. Re-attaches their identity to the new number.",
    parameters: {
      type: "object",
      properties: { code: { type: "string", description: "The request code" } },
      required: ["code"],
    },
    minRank: 4,
    mutates: true,
    handler: async (args, ctx) => {
      const code = String(args.code ?? "").trim().toUpperCase();
      if (!code) return { error: "Which request? Give me its code." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { data: rows } = await db
        .from("number_migration_requests")
        .select("id, claimed_name, new_phone, person_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "pending");
      const req = (rows ?? []).find((r: any) => codeFromId(r.id) === code) as any;
      if (!req) return { error: "No pending request with that code." };
      if (!req.person_id) return { error: "That request isn't matched to a member — ask them to double-check their old number." };

      const ok = await migratePersonPhone(req.person_id, req.new_phone);
      if (!ok) return { error: "Couldn't reconnect — the new number may already belong to someone else." };
      await db.from("number_migration_requests").update({ status: "approved" }).eq("id", req.id);

      // Best-effort welcome to the reconnected member (they just messaged, so
      // they're likely in the session window).
      try { await sendTextMessage(req.new_phone, `Welcome back, ${req.claimed_name || "friend"}! 🙏 Your church has reconnected you — everything's right where you left it.`); } catch { /* ignore */ }
      return { ok: true, message: `✅ Reconnected ${req.claimed_name || "them"} to their new number.` };
    },
  },
  {
    name: "reject_number_migration",
    description: "Reject a pending number-migration request by its code (if you can't confirm it's them).",
    parameters: {
      type: "object",
      properties: { code: { type: "string", description: "The request code" } },
      required: ["code"],
    },
    minRank: 4,
    mutates: true,
    handler: async (args, ctx) => {
      const code = String(args.code ?? "").trim().toUpperCase();
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { data: rows } = await db
        .from("number_migration_requests")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "pending");
      const req = (rows ?? []).find((r: any) => codeFromId(r.id) === code) as any;
      if (!req) return { error: "No pending request with that code." };
      await db.from("number_migration_requests").update({ status: "rejected" }).eq("id", req.id);
      return { ok: true, message: "Rejected — no change made." };
    },
  },
];
