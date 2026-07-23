// Birthdays (ChurchBase scenario 18): members save their birthday (day + month),
// leaders see who's coming up, and a daily cron greets today's celebrants
// (see cron/scheduler.ts). See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */
function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : undefined;
}

export const BIRTHDAY_TOOLS: AgentTool[] = [
  {
    name: "set_birthday",
    description: "Save someone's birthday — day and month, no year needed — so the church can celebrate them. Defaults to the sender.",
    parameters: {
      type: "object",
      properties: { day: { type: "number", description: "Day of month, 1-31" }, month: { type: "number", description: "Month, 1-12" } },
      required: ["day", "month"],
    },
    mutates: true, // member self-service
    handler: async (args, ctx) => {
      const day = clampInt(args.day, 1, 31);
      const month = clampInt(args.month, 1, 12);
      if (!day || !month) return { error: "Tell me the day and month — e.g. 14 and 6 for June 14th." };
      if (!ctx.personId) return { error: "I can save that once you're connected to your church." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("people").update({ birth_day: day, birth_month: month }).eq("id", ctx.personId);
      if (error) return { error: error.message };
      return { ok: true, message: `🎂 Saved — we'll be sure to celebrate you on ${day}/${month}!` };
    },
  },
  {
    name: "list_birthdays",
    description: "Members with birthdays coming up. range: 'today', 'week' (next 7 days), or 'month' (this month).",
    parameters: {
      type: "object",
      properties: { range: { type: "string", description: "today | week | month" } },
      required: [],
    },
    minRank: 2,
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, birthdays: [] };
      const { data: mems } = await db.from("branch_memberships").select("person_id").eq("workspace_id", ctx.workspaceId).eq("status", "active");
      const ids = (mems ?? []).map((m: any) => m.person_id).filter(Boolean);
      if (!ids.length) return { count: 0, birthdays: [] };

      const { data: people } = await db.from("people").select("full_name, birth_day, birth_month").in("id", ids);
      const range = String(args.range ?? "week").toLowerCase();
      const now = new Date();
      const td = now.getDate();
      const tm = now.getMonth() + 1;
      const week = new Set<string>();
      for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(td + i); week.add(`${d.getMonth() + 1}-${d.getDate()}`); }

      const inRange = (bd: number, bm: number) =>
        range === "today" ? bd === td && bm === tm : range === "month" ? bm === tm : week.has(`${bm}-${bd}`);

      const birthdays = (people ?? [])
        .filter((p: any) => p.birth_day && p.birth_month && inRange(p.birth_day, p.birth_month))
        .map((p: any) => ({ name: p.full_name || "", day: p.birth_day, month: p.birth_month }));
      return { count: birthdays.length, birthdays };
    },
  },
];
