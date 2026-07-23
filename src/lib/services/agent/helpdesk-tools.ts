// Front-desk scenarios: lost & found (ChurchBase 13) and office-guest sign-in
// with a code (ChurchBase 4). See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomInt, randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */
function code(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export const HELPDESK_TOOLS: AgentTool[] = [
  // ── Lost & found ──
  {
    name: "report_lost_or_found",
    description: "Report a lost item (or an item someone found). kind is 'lost' or 'found'. Include a description and where.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the item is" },
        location: { type: "string", description: "Where it was lost/found (optional)" },
        kind: { type: "string", description: "'lost' (default) or 'found'" },
      },
      required: ["description"],
    },
    mutates: true, // anyone can report
    handler: async (args, ctx) => {
      const description = String(args.description ?? "").trim();
      if (!description) return { error: "What's the item?" };
      const kind = String(args.kind ?? "lost").toLowerCase() === "found" ? "found" : "lost";
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("lost_found_items").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        kind,
        description,
        location: String(args.location ?? "") || null,
        reporter_name: ctx.userName ?? "",
        reporter_person_id: ctx.personId ?? null,
        status: "open",
      });
      if (error) return { error: error.message };
      return {
        ok: true,
        message: kind === "found"
          ? "🙏 Thank you — I've logged the found item so we can reunite it with its owner."
          : "📝 Noted. I've logged your lost item — check back and we'll flag it if it turns up.",
      };
    },
  },
  {
    name: "list_lost_found",
    description: "Browse open lost & found items — to see if something was handed in, or what people are looking for. kind filters 'lost'/'found'.",
    parameters: {
      type: "object",
      properties: { kind: { type: "string", description: "'lost' or 'found' (optional)" } },
      required: [],
    },
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, items: [] };
      let q = db.from("lost_found_items").select("kind, description, location, created_at").eq("workspace_id", ctx.workspaceId).eq("status", "open");
      const kind = String(args.kind ?? "").toLowerCase();
      if (kind === "lost" || kind === "found") q = q.eq("kind", kind);
      const { data } = await q.order("created_at", { ascending: false }).limit(30);
      const items = (data ?? []).map((r: any) => ({ kind: r.kind, description: r.description, location: r.location ?? "" }));
      return { count: items.length, items };
    },
  },

  // ── Office guest sign-in ──
  {
    name: "register_office_guest",
    description: "Sign a visitor into the church office. Returns a sign-in code for their badge/record.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Visitor's name" },
        purpose: { type: "string", description: "Reason for the visit (optional)" },
        host: { type: "string", description: "Who they're here to see (optional)" },
      },
      required: ["name"],
    },
    minRank: 2, // reception / secretary
    mutates: true,
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "What's the visitor's name?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const signin = code();
      const { error } = await db.from("office_guests").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        name,
        purpose: String(args.purpose ?? "") || null,
        host: String(args.host ?? "") || null,
        signin_code: signin,
        status: "in",
      });
      if (error) return { error: error.message };
      return { ok: true, code: signin, message: `✅ ${name} is signed in. Sign-in code: *${signin}* (use it to sign out).` };
    },
  },
  {
    name: "sign_out_office_guest",
    description: "Sign an office visitor out using their sign-in code.",
    parameters: {
      type: "object",
      properties: { code: { type: "string", description: "The 6-digit sign-in code" } },
      required: ["code"],
    },
    minRank: 2,
    mutates: true,
    handler: async (args, ctx) => {
      const c = String(args.code ?? "").trim();
      if (!c) return { error: "What's the sign-in code?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { data } = await db.from("office_guests").select("id, name").eq("workspace_id", ctx.workspaceId).eq("signin_code", c).eq("status", "in").maybeSingle();
      if (!data) return { error: "No signed-in visitor with that code." };
      const row = data as any;
      const { error } = await db.from("office_guests").update({ status: "out", signed_out_at: new Date().toISOString() }).eq("id", row.id);
      if (error) return { error: error.message };
      return { ok: true, message: `👋 ${row.name} signed out. Thanks!` };
    },
  },
  {
    name: "list_office_guests",
    description: "Visitors currently signed in to the church office.",
    parameters: { type: "object", properties: {} },
    minRank: 2,
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, guests: [] };
      const { data } = await db.from("office_guests").select("name, purpose, host, signin_code").eq("workspace_id", ctx.workspaceId).eq("status", "in").order("signed_in_at", { ascending: true }).limit(50);
      const guests = (data ?? []).map((r: any) => ({ name: r.name, purpose: r.purpose ?? "", host: r.host ?? "", code: r.signin_code }));
      return { count: guests.length, guests };
    },
  },
];
