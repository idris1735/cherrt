// "Belonging" flows for the church module: registering for events and applying
// to join a ministry unit / department. Both member-initiated and reversible,
// so they run immediately. See
// docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

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
      "Apply to join a ministry unit / department (e.g. choir, ushering, media). Creates a pending application for the leader to approve.",
    parameters: {
      type: "object",
      properties: { department: { type: "string", description: "The department/ministry to join" } },
      required: ["department"],
    },
    mutates: true, // member self-service — no minRank
    handler: async (args, ctx) => {
      const dept = String(args.department ?? "").trim();
      if (!dept) return { error: "Which department would you like to join?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { data: units } = await db
        .from("ministry_units")
        .select("name")
        .eq("workspace_id", ctx.workspaceId)
        .ilike("name", `%${dept}%`)
        .limit(1);
      const unitName = ((units ?? [])[0] as { name?: string } | undefined)?.name ?? dept;
      const { error } = await db.from("department_memberships").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        unit_name: unitName,
        member_name: ctx.userName ?? "",
        status: "pending",
      });
      if (error) return { error: error.message };
      return { ok: true, message: `🙌 Your application to join ${unitName} is in — the leader will follow up with you.` };
    },
  },
];
