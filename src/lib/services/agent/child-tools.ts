// Children's check-in (church scenario 04), WhatsApp-native. A guardian checks
// a child in and gets a short pickup code; a volunteer looks the code up to
// verify the guardian at pickup; releasing the child is confirmation-gated for
// safety. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomInt, randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { sendImageMessage } from "@/lib/services/whatsapp";
import type { AgentTool } from "@/lib/services/agent/tools";
import { ensurePerson } from "@/lib/services/identity/people";
import { recordConsent } from "@/lib/services/privacy/consent";
import { resolvePersonIdByPhone } from "@/lib/services/identity/provisioning";

// Where the QR image endpoint lives, so a pickup pass can be delivered in-chat.
function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://cherrt.vercel.app").replace(/\/$/, "");
}

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

// ── WS-D pickup safety ─────────────────────────────────────────────────────
// A 6-digit code is guessable: throttle wrong attempts and bind release to a
// REGISTERED guardian with can_pickup = true. The code is a convenience — the
// guardian match is the gate.
const PICKUP_MAX_WRONG = 5;
const PICKUP_WINDOW_MS = 10 * 60 * 1000;
const PICKUP_LOCK_MS = 15 * 60 * 1000;

type Db = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

async function pickupThrottleMessage(db: Db, workspaceId: string, phone: string, kind: "lookup" | "release"): Promise<string | null> {
  const { data } = await db
    .from("pickup_attempts")
    .select("id, wrong_count, window_started_at, locked_until")
    .eq("workspace_id", workspaceId)
    .eq("phone_number", phone)
    .eq("kind", kind)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; wrong_count: number; window_started_at: string; locked_until: string | null };
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return "Too many wrong pickup attempts — this is locked for a while. A leader can verify in person.";
  }
  if (new Date(row.window_started_at).getTime() + PICKUP_WINDOW_MS < Date.now()) {
    await db.from("pickup_attempts").delete().eq("id", row.id);
    return null;
  }
  if (row.wrong_count >= PICKUP_MAX_WRONG) {
    await db.from("pickup_attempts").update({ locked_until: new Date(Date.now() + PICKUP_LOCK_MS).toISOString() }).eq("id", row.id);
    return "Too many wrong pickup attempts — locked for 15 minutes. A leader can verify in person.";
  }
  return null;
}

async function recordWrongPickupAttempt(db: Db, workspaceId: string, phone: string, kind: "lookup" | "release"): Promise<void> {
  const { data } = await db
    .from("pickup_attempts")
    .select("id, wrong_count, window_started_at")
    .eq("workspace_id", workspaceId)
    .eq("phone_number", phone)
    .eq("kind", kind)
    .maybeSingle();
  const now = new Date();
  if (!data) {
    await db.from("pickup_attempts").insert({ workspace_id: workspaceId, phone_number: phone, kind, wrong_count: 1, window_started_at: now.toISOString() });
    return;
  }
  const row = data as { id: string; wrong_count: number; window_started_at: string };
  const stale = new Date(row.window_started_at).getTime() + PICKUP_WINDOW_MS < now.getTime();
  await db
    .from("pickup_attempts")
    .update({ wrong_count: stale ? 1 : row.wrong_count + 1, window_started_at: stale ? now.toISOString() : row.window_started_at })
    .eq("id", row.id);
}

async function clearPickupAttempts(db: Db, workspaceId: string, phone: string, kind: "lookup" | "release"): Promise<void> {
  await db.from("pickup_attempts").delete().eq("workspace_id", workspaceId).eq("phone_number", phone).eq("kind", kind);
}

// Which child person does this registered guardian (can_pickup) match by name?
async function findGuardianChild(db: Db, guardianPersonId: string, childName: string): Promise<string | null> {
  const { data: gRows } = await db
    .from("guardianships")
    .select("child_person_id")
    .eq("guardian_person_id", guardianPersonId)
    .eq("can_pickup", true);
  const childIds = ((gRows ?? []) as Array<{ child_person_id?: string }>).map((r) => r.child_person_id).filter(Boolean) as string[];
  if (childIds.length === 0) return null;
  const { data: people } = await db.from("people").select("id, full_name").in("id", childIds);
  const target = childName.trim().toLowerCase();
  const match = ((people ?? []) as Array<{ id: string; full_name?: string }>).find((p) => (p.full_name ?? "").trim().toLowerCase() === target);
  return match?.id ?? null;
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
      // WS-D: link the check-in to identity when the sender is registered, so
      // release can later bind to the real guardian (can_pickup), not the code.
      const guardianPersonId = ctx.personId ?? null;
      const childPersonId = guardianPersonId ? await findGuardianChild(db, guardianPersonId, childName) : null;
      const { error } = await db.from("child_checkins").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        child_name: childName,
        age: Number.isFinite(ageNum) && ageNum > 0 ? Math.floor(ageNum) : null,
        allergies: String(args.allergies ?? "") || null,
        guardian_name: String(args.guardianName ?? "") || ctx.userName || "",
        guardian_phone: null,
        child_person_id: childPersonId,
        guardian_person_id: guardianPersonId,
        pickup_code: code,
        status: "checked_in",
      });
      if (error) return { error: error.message };
      // Deliver the pickup pass as a scannable QR image in the chat. At
      // collection a volunteer scans it → WhatsApp opens "Pickup code <code>" →
      // Chertt verifies the guardian. Best-effort: never blocks the check-in,
      // and the printed code above always works as a fallback.
      if (ctx.phone) {
        const imgUrl = `${appUrl()}/qr/img?preset=pickup&code=${code}`;
        try {
          await sendImageMessage(ctx.phone, imgUrl, `👶 ${childName}'s pickup pass — show this at collection. Code: *${code}*`);
        } catch {
          /* image is a bonus; the code in the reply still works */
        }
      }
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
      // WS-D: throttle brute-forcing of the 6-digit code.
      if (ctx.phone) {
        const lockMsg = await pickupThrottleMessage(db, ctx.workspaceId, ctx.phone, "lookup");
        if (lockMsg) return { error: lockMsg };
      }
      const { data } = await db
        .from("child_checkins")
        .select("child_name, age, allergies, guardian_name")
        .eq("workspace_id", ctx.workspaceId)
        .eq("pickup_code", code)
        .eq("status", "checked_in")
        .maybeSingle();
      if (!data) {
        if (ctx.phone) await recordWrongPickupAttempt(db, ctx.workspaceId, ctx.phone, "lookup");
        return { found: false };
      }
      if (ctx.phone) await clearPickupAttempts(db, ctx.workspaceId, ctx.phone, "lookup");
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
      "Mark a child as picked up. ONLY the child's registered guardian (with pickup permission) can release them — the pickup code alone is never enough. This is safety-critical, so it is confirmed before it runs.",
    parameters: {
      type: "object",
      properties: {
        pickupCode: { type: "string", description: "The 6-digit pickup code" },
        pickedUpBy: { type: "string", description: "Who is collecting the child (optional)" },
      },
      required: ["pickupCode"],
    },
    requiresConfirmation: true,
    mutates: true,
    preview: (args) =>
      `👶 Release the child with pickup code *${String(args.pickupCode ?? "")}*? Only their registered guardian may release them.`,
    handler: async (args, ctx) => {
      const code = String(args.pickupCode ?? "").trim();
      if (!code) return { error: "Need the pickup code." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      // WS-D: throttle brute-forcing.
      if (ctx.phone) {
        const lockMsg = await pickupThrottleMessage(db, ctx.workspaceId, ctx.phone, "release");
        if (lockMsg) return { error: lockMsg };
      }
      const { data } = await db
        .from("child_checkins")
        .select("id, child_name, child_person_id, guardian_person_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("pickup_code", code)
        .eq("status", "checked_in")
        .maybeSingle();
      if (!data) {
        if (ctx.phone) await recordWrongPickupAttempt(db, ctx.workspaceId, ctx.phone, "release");
        return { error: "No checked-in child with that code — they may already be picked up." };
      }
      const row = data as { id: string; child_name?: string; child_person_id?: string | null; guardian_person_id?: string | null };

      // WS-D: the guardian match is the gate, the code is a convenience.
      const requesterId = ctx.personId ?? (ctx.phone ? await resolvePersonIdByPhone(ctx.phone) : null);
      if (!requesterId) {
        return { error: "I couldn't verify you as this child's registered guardian. A children's-church leader can verify in person." };
      }
      let childPersonId: string | null = row.child_person_id ?? null;
      if (!childPersonId) {
        childPersonId = await findGuardianChild(db, requesterId, row.child_name ?? "");
      }
      if (!childPersonId) {
        return { error: "I can only release this child to their registered guardian (with pickup permission). A leader can verify in person." };
      }
      const { data: guardianship } = await db
        .from("guardianships")
        .select("id")
        .eq("child_person_id", childPersonId)
        .eq("guardian_person_id", requesterId)
        .eq("can_pickup", true)
        .maybeSingle();
      if (!guardianship) {
        return { error: "I can only release this child to their registered guardian (with pickup permission). A leader can verify in person." };
      }

      const { error } = await db
        .from("child_checkins")
        .update({
          status: "picked_up",
          child_person_id: childPersonId,
          guardian_person_id: requesterId,
          picked_up_by: String(args.pickedUpBy ?? "") || ctx.userName || "",
          picked_up_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) return { error: error.message };
      if (ctx.phone) await clearPickupAttempts(db, ctx.workspaceId, ctx.phone, "release");
      return { ok: true, message: `✅ ${row.child_name ?? "The child"} has been released to their registered guardian. Pickup recorded.` };
    },
  },
  {
    name: "list_checked_in_children",
    description:
      "How many and which children are currently checked in to children's church right now. Use for 'how many kids/children do we have checked in', 'how many kids are here', 'who's in children's church', 'list the children checked in'. This is the live check-in count, not Sunday-service attendance.",
    parameters: { type: "object", properties: {} },
    minRank: 1, // children's-team / leaders — reveals child + guardian names
    dataSensitive: true, // child + guardian PII — never readable by it_technical
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, children: [] };
      const { data } = await db
        .from("child_checkins")
        .select("child_name, age, guardian_name, allergies")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "checked_in")
        .order("checked_in_at", { ascending: true })
        .limit(200);
      const children = (data ?? []).map((r) => {
        const row = r as { child_name?: string; age?: number; guardian_name?: string; allergies?: string };
        return { name: row.child_name ?? "", age: row.age ?? null, guardian: row.guardian_name ?? "", allergies: row.allergies ?? "" };
      });
      return { count: children.length, children };
    },
  },
  {
    name: "register_child",
    description:
      "Register a child in the church. REQUIRES the sender to confirm they are the child's parent/guardian (guardianConsent: true). Captures the child's name, age/birthdate, allergies, medical notes, and classroom. The sender is automatically linked as the primary guardian. NEVER register a child without the guardian's explicit confirmation.",
    parameters: {
      type: "object",
      properties: {
        childName: { type: "string", description: "Full name of the child (required)" },
        guardianConsent: { type: "boolean", description: "The sender confirms: 'I am this child's parent/guardian and I consent to storing these details' (required)" },
        age: { type: "number", description: "Age in years (optional)" },
        birthdate: { type: "string", description: "YYYY-MM-DD (optional — stored on the child's record)" },
        allergies: { type: "string", description: "Any allergies (optional)" },
        medicalNotes: { type: "string", description: "Medical conditions or notes (optional)" },
        classroom: { type: "string", description: "Classroom or age group (optional)" },
        whoMayCollect: { type: "string", description: "Who is allowed to pick the child up (names; optional — stored once)" },
      },
      required: ["childName", "guardianConsent"],
    },
    mutates: true,
    handler: async (args, ctx) => {
      // Slice D — a child can NEVER be stored without recorded guardian consent
      if (args.guardianConsent !== true) {
        return { error: "For the child's safety, I need a parent or guardian to confirm: “I am this child's parent/guardian and I consent to storing their details.” Please confirm and I'll register them." };
      }
      const childName = String(args.childName ?? "").trim();
      if (!childName) return { error: "What's the child's name?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      // Create the child as a person (is_minor=true)
      const childPersonId = await ensurePerson({
        workspaceId: ctx.workspaceId,
        fullName: childName,
      });
      const childPatch: Record<string, unknown> = { is_minor: true };
      if (typeof args.birthdate === "string") childPatch.birthdate = args.birthdate;
      await db.from("people").update(childPatch).eq("id", childPersonId);

      // Guardian-given consent, recorded on the child person + linked to guardian
      const guardianId = ctx.personId;
      if (!guardianId) {
        return { error: "I couldn't confirm who you are — please retry, and a parent or guardian must confirm consent." };
      }
      recordConsent({
        personId: childPersonId,
        source: "guardian",
        guardianPersonId: guardianId,
      }).catch(() => {});

      // Store child-specific profile
      await db.from("child_profiles").insert({
        id: newId(),
        person_id: childPersonId,
        workspace_id: ctx.workspaceId,
        allergies: String(args.allergies ?? "") || null,
        medical_notes: String(args.medicalNotes ?? "") || null,
        classroom: String(args.classroom ?? "") || null,
        who_may_collect: String(args.whoMayCollect ?? "") || null,
      });

      // Link the sender as primary guardian
      await db.from("guardianships").insert({
        id: newId(),
        child_person_id: childPersonId,
        guardian_person_id: guardianId,
        relationship: "parent",
        is_primary: true,
        can_pickup: true,
        workspace_id: ctx.workspaceId,
      });

      return { ok: true, message: `✅ Registered *${childName}* in the children's ministry.` };
    },
  },
  {
    name: "list_children",
    description:
      "List all registered children in the church with their guardians. Use for 'show me the children', 'who are the kids', 'list children'. Leaders/children-workers only.",
    parameters: { type: "object", properties: {} },
    minRank: 3, // leaders +
    dataSensitive: true, // children's data
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, children: [] };
      const { data: childRows } = await db
        .from("child_profiles")
        .select("person_id, allergies, medical_notes, classroom, age_group")
        .eq("workspace_id", ctx.workspaceId)
        .limit(200);
      if (!childRows?.length) return { count: 0, children: [] };

      const personIds = (childRows as Array<{ person_id: string }>).map((r) => r.person_id);
      const { data: peopleRows } = await db.from("people").select("id, full_name").in("id", personIds);
      const { data: guardRows } = await db
        .from("guardianships")
        .select("child_person_id, guardian_person_id, relationship, is_primary")
        .in("child_person_id", personIds)
        .eq("workspace_id", ctx.workspaceId);
      const guardianIds = [...new Set((guardRows ?? []).map((g: any) => g.guardian_person_id))];
      const { data: guardianPeople } = guardianIds.length
        ? await db.from("people").select("id, full_name").in("id", guardianIds)
        : { data: [] };

      const nameById = new Map((peopleRows ?? []).map((p: any) => [p.id, p.full_name]));
      const guardianNameById = new Map((guardianPeople ?? []).map((p: any) => [p.id, p.full_name]));
      const guardsByChild = new Map<string, Array<{ name: string; relationship: string; primary: boolean }>>();
      for (const g of (guardRows ?? []) as any[]) {
        const list = guardsByChild.get(g.child_person_id) ?? [];
        list.push({ name: guardianNameById.get(g.guardian_person_id) ?? "Unknown", relationship: g.relationship, primary: !!g.is_primary });
        guardsByChild.set(g.child_person_id, list);
      }

      const children = (childRows as any[]).map((r) => ({
        name: nameById.get(r.person_id) ?? "Unknown",
        allergies: r.allergies ?? "",
        classroom: r.classroom ?? r.age_group ?? "",
        guardians: guardsByChild.get(r.person_id) ?? [],
      }));

      return { count: children.length, children };
    },
  },
];
