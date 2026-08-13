// "Belonging" flows for the church module: registering for events and applying
// to join a ministry unit / department. Both member-initiated and reversible,
// so they run immediately. See
// docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";
import { ensurePerson } from "@/lib/services/identity/people";
import { notifyLeaders } from "@/lib/services/church/referral";
import { recordConsent } from "@/lib/services/privacy/consent";

export const COMMUNITY_TOOLS: AgentTool[] = [
  {
    name: "list_events",
    description: "Upcoming events/programmes for this church, soonest first.",
    parameters: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, events: [] };
      const { data } = await db
        .from("event_records")
        .select("title, venue, event_date")
        .eq("workspace_id", ctx.workspaceId)
        .order("event_date", { ascending: true })
        .limit(20);
      const events = (data ?? []).map((r) => {
        const row = r as { title?: string; venue?: string; event_date?: string };
        return { title: row.title ?? "", venue: row.venue ?? "", date: row.event_date ?? "" };
      });
      return { count: events.length, events };
    },
  },
  {
    name: "register_for_event",
    description:
      "Register the sender for a church event by name. If the name doesn't match a known event, ask them to check list_events.",
    parameters: {
      type: "object",
      properties: {
        eventTitle: { type: "string", description: "The event's name" },
        notes: { type: "string", description: "Anything they mentioned — diet, transport, plus-ones (optional)" },
      },
      required: ["eventTitle"],
    },
    mutates: true, // member self-service — no minRank
    handler: async (args, ctx) => {
      const title = String(args.eventTitle ?? "").trim();
      if (!title) return { error: "Which event? Tell me its name." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { data: events } = await db
        .from("event_records")
        .select("id, title")
        .eq("workspace_id", ctx.workspaceId)
        .ilike("title", `%${title}%`)
        .limit(1);
      const event = (events ?? [])[0] as { id?: string; title?: string } | undefined;
      if (!event) return { found: false, message: `I couldn't find an event called "${title}". Ask me to list upcoming events.` };
      const { error } = await db.from("event_registrations").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        event_id: event.id ?? null,
        event_title: event.title ?? title,
        attendee_name: ctx.userName ?? "",
        notes: String(args.notes ?? "") || null,
        status: "registered",
      });
      if (error) return { error: error.message };
      return { ok: true, message: `✅ You're registered for ${event.title}. See you there!` };
    },
  },
  {
    name: "list_departments",
    description: "The ministry units / departments a member can join in this church.",
    parameters: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, departments: [] };
      const { data } = await db
        .from("ministry_units")
        .select("name")
        .eq("workspace_id", ctx.workspaceId)
        .order("name", { ascending: true })
        .limit(50);
      const departments = (data ?? []).map((r) => (r as { name?: string }).name ?? "").filter(Boolean);
      return { count: departments.length, departments };
    },
  },
  {
    name: "join_department",
    description:
      "Apply to join a ministry unit / department (e.g. choir, ushering, media). Creates a pending application linked to your person record.",
    parameters: {
      type: "object",
      properties: { department: { type: "string", description: "The department/ministry to join" } },
      required: ["department"],
    },
    mutates: true,
    handler: async (args, ctx) => {
      const dept = String(args.department ?? "").trim();
      if (!dept) return { error: "Which department would you like to join?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      // Find the ministry unit
      const { data: units } = await db
        .from("ministry_units")
        .select("id, name")
        .eq("workspace_id", ctx.workspaceId)
        .ilike("name", `%${dept}%`)
        .limit(1);
      const unit = (units ?? [])[0] as { id?: string; name?: string } | undefined;
      const unitName = unit?.name ?? dept;
      const unitId = unit?.id ?? null;

      // Link to identity spine
      const personId = ctx.personId ?? await ensurePerson({
        workspaceId: ctx.workspaceId,
        fullName: ctx.userName ?? "Member",
        phone: ctx.phone,
      });
      // Consent: the member consents to applying for the department
      recordConsent({ personId, source: "department_join" }).catch(() => {});

      const { error } = await db.from("department_memberships").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        person_id: personId,
        ministry_unit_id: unitId,
        unit_name: unitName,
        member_name: ctx.userName ?? "",
        status: "pending",
      });
      if (error) return { error: error.message };

      // Notify unit leaders
      notifyLeaders({
        workspaceId: ctx.workspaceId,
        message: `🤝 ${ctx.userName ?? "A member"} wants to join ${unitName}. Reply APPROVE or DECLINE to handle it.`,
      }).catch(() => {});

      return { ok: true, message: `🙌 Your application to join ${unitName} is in — the leader will follow up with you.` };
    },
  },
  {
    name: "approve_department_request",
    description: "Approve a pending department membership request. Leaders only.",
    parameters: {
      type: "object",
      properties: {
        memberName: { type: "string", description: "The member's name to look up" },
        department: { type: "string", description: "The department name (for disambiguation)" },
      },
      required: ["memberName"],
    },
    minRank: 3,
    mutates: true,
    handler: async (args, ctx) => {
      const memberName = String(args.memberName ?? "").trim();
      if (!memberName) return { error: "Whose request?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      let query = db.from("department_memberships").update({ status: "approved" }).eq("workspace_id", ctx.workspaceId).eq("member_name", memberName).eq("status", "pending");
      if (typeof args.department === "string") query = query.eq("unit_name", args.department);
      const { error } = await query;
      if (error) return { error: error.message };
      return { ok: true, message: `✅ Approved ${memberName}'s department request.` };
    },
  },
  {
    name: "decline_department_request",
    description: "Decline a pending department membership request. Leaders only.",
    parameters: {
      type: "object",
      properties: {
        memberName: { type: "string", description: "The member's name to look up" },
        department: { type: "string", description: "The department name (for disambiguation)" },
      },
      required: ["memberName"],
    },
    minRank: 3,
    mutates: true,
    handler: async (args, ctx) => {
      const memberName = String(args.memberName ?? "").trim();
      if (!memberName) return { error: "Whose request?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      let query = db.from("department_memberships").update({ status: "declined" }).eq("workspace_id", ctx.workspaceId).eq("member_name", memberName).eq("status", "pending");
      if (typeof args.department === "string") query = query.eq("unit_name", args.department);
      const { error } = await query;
      if (error) return { error: error.message };
      return { ok: true, message: `Declined ${memberName}'s department request.` };
    },
  },
  {
    name: "create_event",
    description:
      "Create a new church event or programme. Use when a leader says 'add a Youth Night this Friday' or 'schedule a workers' retreat'. After creating, members can register for it.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The event's name" },
        venue: { type: "string", description: "Where it's held (optional; defaults to Main Auditorium)" },
        date: { type: "string", description: "Date as YYYY-MM-DD if known (optional; defaults to next Sunday)" },
        expected: { type: "number", description: "How many people are expected (optional)" },
      },
      required: ["title"],
    },
    minRank: 4, // leaders create events
    mutates: true,
    handler: async (args, ctx) => {
      const title = String(args.title ?? "").trim();
      if (!title) return { error: "What's the event called?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      // Use the given date if it's a valid YYYY-MM-DD, else default to next Sunday.
      const raw = String(args.date ?? "").trim();
      let eventDate: string;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))) {
        eventDate = raw;
      } else {
        const d = new Date();
        d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // next Sunday
        eventDate = d.toISOString().slice(0, 10);
      }
      const expected = Number(args.expected);
      const { error } = await db.from("event_records").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        title,
        venue: String(args.venue ?? "").trim() || "Main Auditorium",
        event_date: eventDate,
        guests_expected: Number.isFinite(expected) && expected > 0 ? Math.floor(expected) : 0,
      });
      if (error) return { error: error.message };
      return { ok: true, message: `✅ *${title}* is on the calendar for ${eventDate}. Members can now register for it.` };
    },
  },
];
