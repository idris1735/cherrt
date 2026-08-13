// Church operations the agent handles over WhatsApp: prayer requests,
// first-timer capture, pastoral-care requests, and recording received giving.
// All workspace-scoped, with real persistence. Reads let pastors/finance pull
// what's come in. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";
import { churchApproved } from "@/lib/services/kyc/tiered-access";
import { ensurePerson } from "@/lib/services/identity/people";
import { notifyLeaders } from "@/lib/services/church/referral";
import { recordMilestone } from "@/lib/services/church/milestones";

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
      // Notify leaders so this prayer doesn't go unseen
      notifyLeaders({
        workspaceId: ctx.workspaceId,
        roleAtLeast: "secretary",
        message: `🙏 New prayer request from ${anonymous ? "someone (anonymous)" : ctx.userName ?? "a member"}. Reply here to follow up.`,
      }).catch(() => {});
      // Fixed referral confirmation — never generated spiritual content
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

      // Link to the identity spine
      const personId = await ensurePerson({
        workspaceId: ctx.workspaceId,
        fullName: name,
        phone: typeof args.phone === "string" ? args.phone : undefined,
      });

      const { error } = await db.from("first_timers").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        person_id: personId,
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
    name: "convert_first_timer",
    description:
      "Convert a first-timer into a full church member. Finds by name or phone, creates a member membership, and marks them 'joined'. Leader-only.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The first-timer's name to look up (required)" },
        phone: { type: "string", description: "Phone for disambiguation (optional)" },
        role: { type: "string", description: "Role to assign (optional; defaults to member)" },
      },
      required: ["name"],
    },
    minRank: 4,
    mutates: true,
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "Who should I convert? Tell me their name." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      // Find the first-timer record
      let query = db.from("first_timers").select("id, person_id, name, phone, follow_up_status").eq("workspace_id", ctx.workspaceId).eq("name", name);
      if (typeof args.phone === "string") query = query.eq("phone", args.phone);
      const { data: ftRows } = await query.limit(1);
      const ft = (ftRows ?? [])[0] as { id: string; person_id: string | null; follow_up_status: string } | undefined;
      if (!ft) return { error: `No first-timer named "${name}" found.` };
      if (ft.follow_up_status === "joined") return { error: `${name} is already a member.` };

      // Resolve or create the person
      const personId = ft.person_id ?? await ensurePerson({
        workspaceId: ctx.workspaceId,
        fullName: name,
        phone: typeof args.phone === "string" ? args.phone : undefined,
      });

      // Map role
      const roleMap: Record<string, string> = { member: "member", usher: "dept_leader", finance: "finance", secretary: "secretary", pastor: "pastor" };
      const role = roleMap[String(args.role ?? "").toLowerCase()] ?? "member";

      // Create membership + update first-timer status
      await db.from("branch_memberships").insert({
        id: newId(), person_id: personId, workspace_id: ctx.workspaceId, role, status: "active",
      });
      await db.from("first_timers").update({ follow_up_status: "joined", person_id: personId }).eq("id", ft.id);

      // Auto-emit the joined_membership milestone (best-effort)
      recordMilestone({
        personId,
        workspaceId: ctx.workspaceId,
        type: "joined_membership",
        details: { via: "first_timer_conversion" },
      }).catch(() => {});

      return { ok: true, message: `✅ ${name} is now a member${role !== "member" ? ` (${role})` : ""}.` };
    },
  },
  {
    name: "update_first_timer_status",
    description: "Update a first-timer's follow-up status. Leader-only.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name to look up" },
        status: { type: "string", description: "new, contacted, joined, or inactive" },
      },
      required: ["name", "status"],
    },
    minRank: 4,
    mutates: true,
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      const status = String(args.status ?? "").trim().toLowerCase();
      if (!name) return { error: "Whose status?" };
      if (!["new", "contacted", "joined", "inactive"].includes(status)) return { error: "Status must be new, contacted, joined, or inactive." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("first_timers").update({ follow_up_status: status }).eq("workspace_id", ctx.workspaceId).eq("name", name);
      if (error) return { error: error.message };
      return { ok: true, message: `Updated ${name} to "${status}".` };
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
      // Notify leaders — this is the referral loop being closed
      const category = String(args.category ?? "general") || "general";
      notifyLeaders({
        workspaceId: ctx.workspaceId,
        roleAtLeast: "secretary",
        message: `🕊️ New pastoral-care request (${category}) from ${ctx.userName ?? "a member"}. Reply here to follow up.`,
      }).catch(() => {});
      // Fixed referral confirmation — never generated spiritual content
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
      if (!(await churchApproved(ctx.workspaceId))) return { error: "Your church is still being verified 🛡️ — you'll be able to record giving as soon as it's approved." };
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
  {
    name: "register_member",
    description:
      "Register a new person in the church — give their name, and optionally role, phone, gender, birthdate, address, email, or notes. Use for 'add Sister Grace as an usher', 'register John as a member', or 'add a new member'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The person's full name (required)" },
        role: { type: "string", description: "Their role: member, usher, finance, secretary, children, pastor, dept_leader, staff (optional; defaults to member)" },
        phone: { type: "string", description: "WhatsApp number (optional)" },
        gender: { type: "string", description: "male or female (optional)" },
        birthdate: { type: "string", description: "YYYY-MM-DD (optional)" },
        address: { type: "string", description: "Where they live (optional)" },
        email: { type: "string", description: "Email address (optional)" },
        notes: { type: "string", description: "Any extra info (optional)" },
      },
      required: ["name"],
    },
    minRank: 4, // leaders add people
    mutates: true,
    handler: async (args, ctx) => {
      if (!(await churchApproved(ctx.workspaceId))) return { error: "Your church is still being verified 🛡️ — you'll be able to add members as soon as it's approved." };
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "Who should I add? Tell me their name." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      // Role words → internal slugs
      const roleMap: Record<string, string> = {
        member: "member", usher: "dept_leader", ushering: "dept_leader", leader: "dept_leader",
        dept_leader: "dept_leader", department_leader: "dept_leader",
        finance: "finance", treasurer: "finance", secretary: "secretary",
        children: "children", "children's": "children", pastor: "pastor", staff: "staff",
      };
      const asked = String(args.role ?? "").trim().toLowerCase();
      const role = roleMap[asked] ?? "member";

      // Use ensurePerson so this member links to the identity spine
      const personId = await ensurePerson({
        workspaceId: ctx.workspaceId,
        fullName: name,
        phone: typeof args.phone === "string" ? args.phone : undefined,
      });

      // Update richer profile fields if provided
      const profilePatch: Record<string, unknown> = {};
      if (typeof args.gender === "string") profilePatch.gender = args.gender.toLowerCase();
      if (typeof args.birthdate === "string") profilePatch.birthdate = args.birthdate;
      if (typeof args.address === "string") profilePatch.address = args.address;
      if (typeof args.email === "string") profilePatch.email = args.email;
      if (typeof args.notes === "string") profilePatch.notes = args.notes;
      if (Object.keys(profilePatch).length > 0) {
        await db.from("people").update(profilePatch).eq("id", personId);
      }

      // Create the membership
      const m = await db.from("branch_memberships").insert({
        id: newId(), person_id: personId, workspace_id: ctx.workspaceId, role, status: "active",
      });
      if (m.error) return { error: m.error.message };

      const roleLabel = role === "dept_leader" ? "an usher/leader" : role;
      return { ok: true, message: `✅ Registered *${name}*${role !== "member" ? ` as ${roleLabel}` : ""}.` };
    },
  },
  {
    // Kept as an alias so existing agent tool lookups still match
    name: "add_member",
    description: "Alias for register_member — add a new person to the church.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The person's full name" },
        role: { type: "string", description: "Their role (optional; defaults to member)" },
        phone: { type: "string", description: "WhatsApp number (optional)" },
        gender: { type: "string", description: "male or female (optional)" },
        birthdate: { type: "string", description: "YYYY-MM-DD (optional)" },
        address: { type: "string", description: "Where they live (optional)" },
        email: { type: "string", description: "Email address (optional)" },
        notes: { type: "string", description: "Any extra info (optional)" },
      },
      required: ["name"],
    },
    minRank: 4,
    mutates: true,
    handler: async (args, ctx) => {
      // Delegate to the register_member handler
      const regTool = CHURCH_TOOLS.find((t) => t.name === "register_member");
      return regTool ? regTool.handler(args, ctx) : { error: "register_member not found" };
    },
  },
  {
    name: "get_top_givers",
    description:
      "The church's top givers this month — who has given the most. Use for 'top givers', 'who gives the most', 'biggest givers this month'. Leadership/finance only.",
    parameters: { type: "object", properties: {} },
    minRank: 3, // reveals who gives what — finance and above
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, givers: [] };
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await db
        .from("giving_records")
        .select("donor_name, amount")
        .eq("workspace_id", ctx.workspaceId)
        .gte("created_at", start.toISOString());
      const totals: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ donor_name?: string; amount?: number }>) {
        const name = (r.donor_name ?? "").trim() || "Anonymous";
        totals[name] = (totals[name] ?? 0) + Number(r.amount ?? 0);
      }
      const givers = Object.entries(totals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, total]) => ({ name, total }));
      return { count: givers.length, givers };
    },
  },
  {
    name: "list_pastoral_requests",
    description: "List pastoral-care requests for the church so a pastor/leader can follow up. Shows open/pending requests with category and requester.",
    parameters: { type: "object", properties: {} },
    minRank: 3,
    dataSensitive: true,
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, requests: [] };
      const { data } = await db
        .from("pastoral_care_requests")
        .select("id, requester_name, category, details, status, created_at")
        .eq("workspace_id", ctx.workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);
      const requests = (data ?? []).map((r: any) => ({
        id: r.id, requester: r.requester_name, category: r.category,
        details: r.details ?? "", status: r.status, createdAt: r.created_at,
      }));
      return { count: requests.length, requests };
    },
  },
  {
    name: "assign_pastoral_request",
    description: "Assign a pastoral-care request to yourself or someone else for follow-up.",
    parameters: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "The request ID to assign" },
        assignee: { type: "string", description: "Who to assign to (name; optional — defaults to you)" },
      },
      required: ["requestId"],
    },
    minRank: 3,
    mutates: true,
    handler: async (args, ctx) => {
      const requestId = String(args.requestId ?? "").trim();
      if (!requestId) return { error: "Which request?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("pastoral_care_requests")
        .update({ assigned_to: String(args.assignee ?? ctx.userName ?? ""), status: "scheduled" })
        .eq("id", requestId)
        .eq("workspace_id", ctx.workspaceId);
      if (error) return { error: error.message };
      return { ok: true, message: "✅ Request assigned." };
    },
  },
  {
    name: "resolve_pastoral_request",
    description: "Mark a pastoral-care request as resolved after follow-up.",
    parameters: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "The request ID to resolve" },
      },
      required: ["requestId"],
    },
    minRank: 3,
    mutates: true,
    handler: async (args, ctx) => {
      const requestId = String(args.requestId ?? "").trim();
      if (!requestId) return { error: "Which request?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("pastoral_care_requests")
        .update({ status: "resolved" })
        .eq("id", requestId)
        .eq("workspace_id", ctx.workspaceId);
      if (error) return { error: error.message };
      return { ok: true, message: "✅ Request resolved." };
    },
  },
  {
    name: "submit_pastoral_form",
    description:
      "Submit a pastoral-care form — baby dedication, child naming, house dedication, pre-marital counselling, or training school. Use for 'I want to dedicate my baby', 'register for marriage counselling', 'enrol in the training school', or any of the five form types.",
    parameters: {
      type: "object",
      properties: {
        formType: { type: "string", description: "baby_dedication, child_naming, house_dedication, pre_marital, or training_school" },
        details: { type: "string", description: "Any extra details — names, dates, preferences (optional)" },
      },
      required: ["formType"],
    },
    mutates: true,
    handler: async (args, ctx) => {
      const formType = String(args.formType ?? "").trim().toLowerCase();
      const validTypes = ["baby_dedication", "child_naming", "house_dedication", "pre_marital", "training_school"];
      if (!validTypes.includes(formType)) return { error: `I need one of: ${validTypes.join(", ")}.` };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      // Link to a real person — an unlinked submitter still gets a person row
      const personId = ctx.personId ?? await ensurePerson({
        workspaceId: ctx.workspaceId,
        fullName: ctx.userName ?? "Member",
        phone: ctx.phone,
      });

      const { error } = await db.from("pastoral_form_submissions").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        person_id: personId,
        form_type: formType,
        data: { details: String(args.details ?? ""), submitted_by: ctx.userName ?? "" },
        status: "submitted",
      });
      if (error) return { error: error.message };

      // Notify leaders
      const labelMap: Record<string, string> = { baby_dedication: "Baby Dedication", child_naming: "Child Naming", house_dedication: "House Dedication", pre_marital: "Pre-Marital Counselling", training_school: "Training School" };
      const label = labelMap[formType] ?? formType;
      notifyLeaders({
        workspaceId: ctx.workspaceId,
        message: `📋 New ${label} form submitted by ${ctx.userName ?? "a member"}. Reply here to follow up.`,
      }).catch(() => {});

      return { ok: true, message: `✅ Your ${label} form has been submitted. A pastor will follow up.` };
    },
  },
  {
    name: "list_pastoral_forms",
    description: "List all pastoral form submissions for the church. Leaders only.",
    parameters: { type: "object", properties: {} },
    minRank: 3,
    dataSensitive: true,
    handler: async (_args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, submissions: [] };
      const { data } = await db
        .from("pastoral_form_submissions")
        .select("id, form_type, data, status, created_at")
        .eq("workspace_id", ctx.workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);
      const submissions = (data ?? []).map((r: any) => ({
        id: r.id, formType: r.form_type, details: r.data?.details ?? "", status: r.status, createdAt: r.created_at,
      }));
      return { count: submissions.length, submissions };
    },
  },
  {
    name: "update_pastoral_form_status",
    description: "Update the status of a pastoral form submission. Leaders only.",
    parameters: {
      type: "object",
      properties: {
        submissionId: { type: "string", description: "The submission ID" },
        status: { type: "string", description: "submitted, reviewing, scheduled, or completed" },
      },
      required: ["submissionId", "status"],
    },
    minRank: 3,
    mutates: true,
    handler: async (args, ctx) => {
      const submissionId = String(args.submissionId ?? "").trim();
      const status = String(args.status ?? "").trim().toLowerCase();
      if (!submissionId) return { error: "Which submission?" };
      if (!["submitted", "reviewing", "scheduled", "completed"].includes(status)) return { error: "Status must be submitted, reviewing, scheduled, or completed." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      // Look up the submission so completion can auto-emit a milestone
      const { data: subRows } = await db.from("pastoral_form_submissions")
        .select("form_type, person_id")
        .eq("id", submissionId)
        .eq("workspace_id", ctx.workspaceId)
        .limit(1);
      const sub = (subRows ?? [])[0] as { form_type?: string; person_id?: string | null } | undefined;

      const { error } = await db.from("pastoral_form_submissions").update({ status }).eq("id", submissionId).eq("workspace_id", ctx.workspaceId);
      if (error) return { error: error.message };

      // Auto-emit child_dedication when a dedication/naming form completes
      if (status === "completed" && sub && (sub.form_type === "baby_dedication" || sub.form_type === "child_naming") && sub.person_id) {
        recordMilestone({
          personId: sub.person_id,
          workspaceId: ctx.workspaceId,
          type: "child_dedication",
          details: { via: `${sub.form_type}_form` },
        }).catch(() => {});
      }

      return { ok: true, message: `✅ Updated to "${status}".` };
    },
  },
];
