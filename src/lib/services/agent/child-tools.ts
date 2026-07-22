// Children's check-in (church scenario 04), WhatsApp-native. A guardian checks
// a child in and gets a short pickup code; a volunteer looks the code up to
// verify the guardian at pickup; releasing the child is confirmation-gated for
// safety. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomInt, randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

function newId(): string {
  return randomUUID();
}

// Cryptographically-strong 6-digit pickup code. A CSPRNG (not Math.random) with
// 1,000,000 possibilities makes guessing a valid code for the checked-in cohort
// infeasible — important because the code guards a child's identity and release.
// Defence in depth: release_child is confirmation-gated and a volunteer must
// visually verify the guardian against lookup_child_pickup before releasing, so
// the code is never the sole control. (Follow-up hardening: per-workspace rate
// limiting on lookup/release attempts, and binding release to the guardian's
// verified WhatsApp identity.)
function pickupCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export const CHILD_TOOLS: AgentTool[] = [
  {
    name: "check_in_child",
    description:
      "Check a child into children's church. Captures name, age, allergies and the guardian, and returns a pickup code to show at collection.",
    parameters: {
      type: "object",
      properties: {
        childName: { type: "string" },
        age: { type: "number", description: "Child's age (optional)" },
        allergies: { type: "string", description: "Allergies or notes (optional)" },
        guardianName: { type: "string", description: "Guardian's name (optional; defaults to the sender)" },
      },
      required: ["childName"],
    },
    mutates: true, // a parent checking in their own child — no minRank
    handler: async (args, ctx) => {
      const childName = String(args.childName ?? "").trim();
      if (!childName) return { error: "Need the child's name." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const ageNum = Number(args.age);
      const code = pickupCode();
      const { error } = await db.from("child_checkins").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        child_name: childName,
        age: Number.isFinite(ageNum) && ageNum > 0 ? Math.floor(ageNum) : null,
        allergies: String(args.allergies ?? "") || null,
        guardian_name: String(args.guardianName ?? "") || ctx.userName || "",
        guardian_phone: null,
        pickup_code: code,
        status: "checked_in",
      });
      if (error) return { error: error.message };
      return {
        ok: true,
        pickupCode: code,
        message: `✅ ${childName} is checked in. Pickup code: *${code}* — show this at collection.`,
      };
    },
  },
  {
    name: "lookup_child_pickup",
    description:
      "Look up a checked-in child by pickup code so a volunteer can verify the guardian before releasing the child.",
    parameters: {
      type: "object",
      properties: { pickupCode: { type: "string", description: "The pickup code" } },
      required: ["pickupCode"],
    },
    minRank: 1, // children's-church volunteers / leaders only — guards child + guardian PII
    handler: async (args, ctx) => {
      const code = String(args.pickupCode ?? "").trim();
      if (!code) return { error: "Need the pickup code." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { data } = await db
        .from("child_checkins")
        .select("child_name, age, allergies, guardian_name")
        .eq("workspace_id", ctx.workspaceId)
        .eq("pickup_code", code)
        .eq("status", "checked_in")
        .maybeSingle();
      if (!data) return { found: false };
      const row = data as { child_name?: string; age?: number; allergies?: string; guardian_name?: string };
      return {
        found: true,
        child: {
          name: row.child_name ?? "",
          age: row.age ?? null,
          allergies: row.allergies ?? "",
          guardian: row.guardian_name ?? "",
        },
      };
    },
  },
  {
    name: "release_child",
    description:
      "Mark a child as picked up. Only after verifying the guardian matches. This is safety-critical, so it is confirmed before it runs.",
    parameters: {
      type: "object",
      properties: {
        pickupCode: { type: "string", description: "The 4-digit pickup code" },
        pickedUpBy: { type: "string", description: "Who is collecting the child (optional)" },
      },
      required: ["pickupCode"],
    },
    requiresConfirmation: true,
    minRank: 1, // children's-church volunteers / leaders only may release a child
    mutates: true,
    preview: (args) =>
      `👶 Release the child with pickup code *${String(args.pickupCode ?? "")}*? Confirm the guardian's details match first.`,
    handler: async (args, ctx) => {
      const code = String(args.pickupCode ?? "").trim();
      if (!code) return { error: "Need the pickup code." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { data } = await db
        .from("child_checkins")
        .select("id, child_name")
        .eq("workspace_id", ctx.workspaceId)
        .eq("pickup_code", code)
        .eq("status", "checked_in")
        .maybeSingle();
      if (!data) return { error: "No checked-in child with that code — they may already be picked up." };
      const row = data as { id: string; child_name?: string };
      const { error } = await db
        .from("child_checkins")
        .update({ status: "picked_up", picked_up_by: String(args.pickedUpBy ?? "") || ctx.userName || "", picked_up_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) return { error: error.message };
      return { ok: true, message: `✅ ${row.child_name ?? "The child"} has been released. Pickup recorded.` };
    },
  },
];
