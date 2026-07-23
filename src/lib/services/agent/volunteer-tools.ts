// Volunteer scheduling (ChurchBase scenarios 15/17): a leader raises a need,
// members sign up, and the leader gets the roster. Broadcasting the need to
// everyone reuses announcements. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Finds an open need whose title matches (or the most recent open one).
async function findOpenNeed(db: any, workspaceId: string, title: string): Promise<{ id: string; title: string } | null> {
  let q = db.from("volunteer_needs").select("id, title").eq("workspace_id", workspaceId).eq("status", "open");
  if (title) q = q.ilike("title", `%${title}%`);
  const { data } = await q.order("created_at", { ascending: false }).limit(1);
  const row = (data ?? [])[0];
  return row ? { id: row.id, title: row.title } : null;
}

export const VOLUNTEER_TOOLS: AgentTool[] = [
  {
    name: "request_volunteers",
    description: "Open a call for volunteers, e.g. 'need 5 ushers for Sunday'. Members can then sign up. Announce it to everyone with create_announcement if you want.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What's needed, e.g. Ushers, Choir for the vigil" },
        when: { type: "string", description: "When it's for (optional)" },
        slots: { type: "number", description: "How many are needed (optional)" },
      },
      required: ["title"],
    },
    minRank: 1, // department leaders and above
    mutates: true,
    handler: async (args, ctx) => {
      const title = String(args.title ?? "").trim();
      if (!title) return { error: "What are you looking for volunteers for?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const slots = Number(args.slots);
      const { error } = await db.from("volunteer_needs").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        title,
        when_label: String(args.when ?? "") || null,
        slots_needed: Number.isFinite(slots) && slots > 0 ? Math.floor(slots) : null,
        status: "open",
        created_by_name: ctx.userName ?? "",
      });
      if (error) return { error: error.message };
      return { ok: true, message: `🙌 Opened a call for *${title}*. Members can now reply to volunteer — want me to announce it to everyone?` };
    },
  },
  {
    name: "list_volunteer_needs",
    description: "Open volunteer calls a member can sign up for.",
    parameters: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, needs: [] };
      const { data } = await db
        .from("volunteer_needs")
        .select("title, when_label, slots_needed")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20);
      const needs = (data ?? []).map((r: any) => ({ title: r.title, when: r.when_label ?? "", slots: r.slots_needed ?? null }));
      return { count: needs.length, needs };
    },
  },
  {
    name: "volunteer_signup",
    description: "Sign the sender up to volunteer for an open call (match it by name, e.g. 'ushers').",
    parameters: {
      type: "object",
      properties: { title: { type: "string", description: "Which call to volunteer for" } },
      required: [],
    },
    mutates: true, // member self-service
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const need = await findOpenNeed(db, ctx.workspaceId, String(args.title ?? "").trim());
      if (!need) return { found: false, message: "There's no open volunteer call matching that right now." };
      const { error } = await db.from("volunteer_signups").upsert(
        { id: randomUUID(), workspace_id: ctx.workspaceId, need_id: need.id, person_id: ctx.personId ?? null, name: ctx.userName ?? "" },
        { onConflict: "need_id,person_id" },
      );
      if (error && error.code !== "23505") return { error: error.message };
      return { ok: true, message: `🙌 You're signed up for *${need.title}*. Thank you for serving!` };
    },
  },
  {
    name: "get_volunteer_roster",
    description: "Who has signed up to volunteer — for a specific call, or the most recent open one.",
    parameters: {
      type: "object",
      properties: { title: { type: "string", description: "Which call (optional)" } },
      required: [],
    },
    minRank: 1,
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { found: false };
      const need = await findOpenNeed(db, ctx.workspaceId, String(args.title ?? "").trim());
      if (!need) return { found: false, message: "No open volunteer call found." };
      const { data } = await db.from("volunteer_signups").select("name").eq("need_id", need.id).order("created_at", { ascending: true });
      const volunteers = (data ?? []).map((r: any) => r.name || "Someone");
      return { found: true, title: need.title, count: volunteers.length, volunteers };
    },
  },
];
