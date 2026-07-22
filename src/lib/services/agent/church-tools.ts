// Church operations the agent handles over WhatsApp: prayer requests,
// first-timer capture, pastoral-care requests, and recording received giving.
// All workspace-scoped, with real persistence. Reads let pastors/finance pull
// what's come in. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const GIVING_TYPES = ["tithe", "offering", "donation", "pledge"] as const;
function normalizeGivingType(raw: unknown): (typeof GIVING_TYPES)[number] {
  const t = String(raw ?? "").toLowerCase();
  return (GIVING_TYPES as readonly string[]).includes(t) ? (t as (typeof GIVING_TYPES)[number]) : "donation";
}

export const CHURCH_TOOLS: AgentTool[] = [
  // ── Reads (for pastors / finance) ──
  {
    name: "list_prayer_requests",
    description: "Open prayer requests in this church. Anonymous ones hide the requester's name.",
    parameters: { type: "object", properties: {} },
    minRank: 4, // pastoral — prayer requests are sensitive
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, requests: [] };
      const { data } = await db
        .from("prayer_requests")
        .select("requester_name, request, is_anonymous")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20);
      const requests = (data ?? []).map((r) => {
        const row = r as { requester_name?: string; request?: string; is_anonymous?: boolean };
        return { from: row.is_anonymous ? "Anonymous" : row.requester_name || "Someone", request: row.request ?? "" };
      });
      return { count: requests.length, requests };
    },
  },
  {
    name: "list_first_timers",
    description: "First-time visitors captured for this church, most recent first — for follow-up.",
    parameters: { type: "object", properties: {} },
    minRank: 2, // follow-up team (secretary+) — visitor PII
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, firstTimers: [] };
      const { data } = await db
        .from("first_timers")
        .select("name, phone, invited_by, follow_up_status")
        .eq("workspace_id", ctx.workspaceId)
        .order("created_at", { ascending: false })
        .limit(20);
      const firstTimers = (data ?? []).map((r) => {
        const row = r as { name?: string; phone?: string; invited_by?: string; follow_up_status?: string };
        return { name: row.name ?? "", phone: row.phone ?? "", invitedBy: row.invited_by ?? "", status: row.follow_up_status ?? "new" };
      });
      return { count: firstTimers.length, firstTimers };
    },
  },

  // ── Actions (immediate — none move money out) ──
  {
    name: "capture_prayer_request",
    description: "Record a prayer request. Set anonymous=true if the person doesn't want their name shown.",
    parameters: {
      type: "object",
      properties: {
        request: { type: "string", description: "What to pray about" },
        anonymous: { type: "boolean", description: "Hide the requester's name" },
      },
      required: ["request"],
    },
    mutates: true, // member self-service — no minRank
    handler: async (args, ctx) => {
      const request = String(args.request ?? "").trim();
      if (!request) return { error: "Need something to pray about." };
      const anonymous = args.anonymous === true;
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("prayer_requests").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        // person_id links the request to the human (for their own recall), even
        // when anonymous — the display name is masked, the identity link isn't.
        person_id: ctx.personId ?? null,
        requester_name: anonymous ? "" : ctx.userName ?? "",
        request,
        is_anonymous: anonymous,
        status: "open",
      });
      if (error) return { error: error.message };
      return { ok: true, message: "🙏 Your prayer request has been sent to the prayer team." };
    },
  },
  {
    name: "capture_first_timer",
    description: "Capture a first-time visitor's details so the church can follow up.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string", description: "Phone number (optional)" },
        invitedBy: { type: "string", description: "Who invited them (optional)" },
      },
      required: ["name"],
    },
    mutates: true, // self or an usher capturing a visitor — no minRank
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "Need the visitor's name." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("first_timers").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        name,
        phone: String(args.phone ?? "") || null,
        invited_by: String(args.invitedBy ?? "") || null,
        follow_up_status: "new",
      });
      if (error) return { error: error.message };
      return { ok: true, message: `Welcome ${name}! We've noted your details and someone will reach out.` };
    },
  },
  {
    name: "request_pastoral_care",
    description:
      "Log a pastoral-care or counselling request (e.g. marriage, finance, spiritual, health, bereavement) so a pastor can follow up.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "e.g. marriage, finance, spiritual, health, bereavement" },
        details: { type: "string", description: "Any details the person shared (optional)" },
      },
      required: [],
    },
    mutates: true, // member self-service — no minRank
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("pastoral_care_requests").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        person_id: ctx.personId ?? null,
        requester_name: ctx.userName ?? "",
        category: String(args.category ?? "general") || "general",
        details: String(args.details ?? "") || null,
        status: "open",
      });
      if (error) return { error: error.message };
      return { ok: true, message: "A pastor will reach out to you soon. 🙏" };
    },
  },
  {
    name: "record_giving",
    description:
      "Record a giving that has been RECEIVED (e.g. cash or transfer at a service). For a member who wants to give and needs an account to pay into, this is NOT the tool.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in Naira" },
        givingType: { type: "string", description: "tithe, offering, donation, or pledge" },
        donor: { type: "string", description: "Who gave (optional; defaults to the sender)" },
      },
      required: ["amount"],
    },
    minRank: 3, // finance and above — this writes the official giving ledger
    mutates: true,
    handler: async (args, ctx) => {
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { error: "Need a positive amount." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const givingType = normalizeGivingType(args.givingType);
      const { error } = await db.from("giving_records").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        // person_id present only when finance records giving for themselves;
        // when they record on a donor's behalf, keep it null (donor_name only).
        person_id: String(args.donor ?? "") ? null : ctx.personId ?? null,
        donor_name: String(args.donor ?? "") || ctx.userName || "Anonymous",
        amount,
        channel: "manual-entry",
        service: "giving",
        giving_type: givingType,
      });
      if (error) return { error: error.message };
      return { ok: true, message: `Recorded ₦${amount.toLocaleString("en-NG")} ${givingType}.` };
    },
  },
];
