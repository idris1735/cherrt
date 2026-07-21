// Life-journey intakes: bereavement support, marriage prep, baptism classes,
// and new-convert discipleship. Each captures the request and flags it for a
// pastor to follow up. (The daily discipleship content delivery needs a
// scheduler/cron — noted as a follow-up; enrolment itself works now.)
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool, AgentContext } from "@/lib/services/agent/tools";

type JourneyType = "bereavement" | "marriage_prep" | "baptism" | "discipleship";

async function startJourney(
  ctx: AgentContext,
  journeyType: JourneyType,
  details: Record<string, unknown>,
  message: string,
): Promise<unknown> {
  const db = getSupabaseServerClient();
  if (!db) return { error: "storage unavailable" };
  const cleaned = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined && v !== ""));
  const { error } = await db.from("life_journeys").insert({
    id: randomUUID(),
    workspace_id: ctx.workspaceId,
    journey_type: journeyType,
    person_name: ctx.userName ?? "",
    details: cleaned,
    status: "active",
  });
  if (error) return { error: error.message };
  return { ok: true, message };
}

export const JOURNEY_TOOLS: AgentTool[] = [
  {
    name: "start_bereavement_support",
    description:
      "Log a bereavement so the pastor, prayer team and care committee can respond. Use when someone reports a death or loss.",
    parameters: {
      type: "object",
      properties: {
        deceased: { type: "string", description: "Who passed (optional)" },
        relationship: { type: "string", description: "Their relationship to the person (optional)" },
        notes: { type: "string", description: "Anything else shared (optional)" },
      },
      required: [],
    },
    handler: (args, ctx) =>
      startJourney(
        ctx,
        "bereavement",
        { deceased: String(args.deceased ?? ""), relationship: String(args.relationship ?? ""), notes: String(args.notes ?? "") },
        "We're so sorry for your loss. 🕊️ The pastor and care team have been notified and will reach out to you.",
      ),
  },
  {
    name: "register_marriage_prep",
    description: "Register a couple for marriage preparation / counselling so the pastor can schedule sessions.",
    parameters: {
      type: "object",
      properties: {
        partner: { type: "string", description: "The other partner's name (optional)" },
        weddingDate: { type: "string", description: "Planned wedding date (optional)" },
      },
      required: [],
    },
    handler: (args, ctx) =>
      startJourney(
        ctx,
        "marriage_prep",
        { partner: String(args.partner ?? ""), weddingDate: String(args.weddingDate ?? "") },
        "🎉 Your marriage-prep request is in — the pastor will reach out to schedule your sessions.",
      ),
  },
  {
    name: "register_baptism",
    description: "Register someone for the next baptism class.",
    parameters: {
      type: "object",
      properties: { candidate: { type: "string", description: "Who is being baptized (optional; defaults to the sender)" } },
      required: [],
    },
    handler: (args, ctx) =>
      startJourney(
        ctx,
        "baptism",
        { candidate: String(args.candidate ?? "") || ctx.userName || "" },
        "💧 You're registered for the next baptism class. We'll confirm the date with you.",
      ),
  },
  {
    name: "enroll_discipleship",
    description:
      "Enrol a new convert into the discipleship / new-believer follow-up journey. Use when someone gives their life to Christ or asks to grow.",
    parameters: {
      type: "object",
      properties: { convert: { type: "string", description: "The new convert's name (optional; defaults to the sender)" } },
      required: [],
    },
    handler: (args, ctx) =>
      startJourney(
        ctx,
        "discipleship",
        { convert: String(args.convert ?? "") || ctx.userName || "" },
        "🙌 Welcome to the family of God! You've been enrolled in our new-believer journey and a mentor will follow up with you.",
      ),
  },
  {
    name: "list_life_journeys",
    description:
      "List active life-journey cases for follow-up (bereavement, marriage prep, baptism, discipleship). Optionally filter by type.",
    parameters: {
      type: "object",
      properties: { type: { type: "string", description: "bereavement, marriage_prep, baptism, or discipleship (optional)" } },
      required: [],
    },
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, journeys: [] };
      let query = db
        .from("life_journeys")
        .select("journey_type, person_name, details")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "active");
      const type = String(args.type ?? "").trim();
      if (["bereavement", "marriage_prep", "baptism", "discipleship"].includes(type)) {
        query = query.eq("journey_type", type);
      }
      const { data } = await query.order("created_at", { ascending: false }).limit(30);
      const journeys = (data ?? []).map((r) => {
        const row = r as { journey_type?: string; person_name?: string; details?: Record<string, unknown> };
        return { type: row.journey_type ?? "", person: row.person_name ?? "", details: row.details ?? {} };
      });
      return { count: journeys.length, journeys };
    },
  },
];
