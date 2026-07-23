// Sunday Operations — the weekly service and everything that rolls up into it:
// the service summary (attendance, salvations, first-timers, preacher, topic,
// times), member self check-in, and department-head reports that a pastor sees
// as one picture. Covers ChurchBase scenarios 1, 2 and 24.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

const today = () => new Date().toISOString().slice(0, 10);
function serviceDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : today();
}
function intOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

// Finds the service for a date (default today), creating a bare one if none
// exists — so attendance, reports and summary all attach to the same service.
async function getOrCreateService(db: Db, workspaceId: string, date: string): Promise<{ id: string } | null> {
  const { data: existing } = await db
    .from("services")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("service_date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { id: existing.id as string };

  const { data: created, error } = await db
    .from("services")
    .insert({ workspace_id: workspaceId, service_date: date, status: "open" })
    .select("id")
    .single();
  if (error || !created) return null;
  return { id: created.id as string };
}

export const SUNDAY_TOOLS: AgentTool[] = [
  {
    name: "record_service_summary",
    description:
      "Record (or update) the summary of a service — any of: attendance (adults + children), first-timers, salvations/decisions, the preacher, the message/topic, start/end times, offering total, notes. Fills in whatever the user mentions; call again to add more.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Service date YYYY-MM-DD (optional; defaults to today)" },
        serviceType: { type: "string", description: "e.g. Sunday Service, Midweek, Vigil (optional)" },
        preacher: { type: "string", description: "Who preached (optional)" },
        topic: { type: "string", description: "The message / sermon topic (optional)" },
        startTime: { type: "string", description: "Start time, e.g. 9:00am (optional)" },
        endTime: { type: "string", description: "End time (optional)" },
        adults: { type: "number", description: "Adult attendance (optional)" },
        children: { type: "number", description: "Children's church attendance (optional)" },
        firstTimers: { type: "number", description: "Number of first-timers (optional)" },
        salvations: { type: "number", description: "Salvations / decisions (optional)" },
        offering: { type: "number", description: "Offering total in Naira (optional)" },
        notes: { type: "string", description: "Any extra notes (optional)" },
      },
      required: [],
    },
    minRank: 2, // secretary / pastor records the service
    mutates: true,
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const svc = await getOrCreateService(db, ctx.workspaceId, serviceDate(args.date));
      if (!svc) return { error: "Couldn't start today's service record — please try again." };

      const patch: Record<string, unknown> = { created_by_name: ctx.userName ?? "" };
      if (args.serviceType) patch.service_type = String(args.serviceType);
      if (args.preacher) patch.preacher = String(args.preacher);
      if (args.topic) patch.message_topic = String(args.topic);
      if (args.startTime) patch.start_time = String(args.startTime);
      if (args.endTime) patch.end_time = String(args.endTime);
      const adults = intOrUndef(args.adults); if (adults !== undefined) patch.attendance_adults = adults;
      const children = intOrUndef(args.children); if (children !== undefined) patch.attendance_children = children;
      const ft = intOrUndef(args.firstTimers); if (ft !== undefined) patch.first_timers_count = ft;
      const sv = intOrUndef(args.salvations); if (sv !== undefined) patch.salvations_count = sv;
      const off = Number(args.offering); if (Number.isFinite(off) && off >= 0) patch.offering_total = off;
      if (args.notes) patch.notes = String(args.notes);

      if (Object.keys(patch).length <= 1) {
        return { error: "Tell me what to record — attendance, preacher, topic, times, and so on." };
      }
      const { error } = await db.from("services").update(patch).eq("id", svc.id);
      if (error) return { error: error.message };
      return { ok: true, message: "📋 Service summary saved. Ask me for the full picture any time." };
    },
  },
  {
    name: "mark_attendance",
    description: "Mark the sender (or a named person) present at today's service. Use when someone says they're here / present.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Who is present (optional; defaults to the sender)" } },
      required: [],
    },
    mutates: true, // member self check-in — no minRank
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const svc = await getOrCreateService(db, ctx.workspaceId, today());
      if (!svc) return { error: "Couldn't record attendance — please try again." };
      const name = String(args.name ?? "") || ctx.userName || "";
      const { error } = await db.from("service_attendance").upsert(
        { workspace_id: ctx.workspaceId, service_id: svc.id, person_id: ctx.personId ?? null, name },
        { onConflict: "service_id,person_id" },
      );
      if (error && error.code !== "23505") return { error: error.message };
      return { ok: true, message: "✅ You're marked present. So glad you're here today! 🙏" };
    },
  },
  {
    name: "submit_service_report",
    description:
      "File a department's report for today's service (e.g. Ushering counted 320, Children's Church had 45). Rolls up into the service summary the pastor sees.",
    parameters: {
      type: "object",
      properties: {
        department: { type: "string", description: "The department / unit reporting" },
        headcount: { type: "number", description: "How many they counted (optional)" },
        details: { type: "string", description: "Any notes (optional)" },
      },
      required: ["department"],
    },
    minRank: 1, // department leaders and above
    mutates: true,
    handler: async (args, ctx) => {
      const dept = String(args.department ?? "").trim();
      if (!dept) return { error: "Which department is this report for?" };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const svc = await getOrCreateService(db, ctx.workspaceId, today());
      if (!svc) return { error: "Couldn't file that report — please try again." };
      const { error } = await db.from("service_reports").insert({
        workspace_id: ctx.workspaceId,
        service_id: svc.id,
        department: dept,
        reporter_name: ctx.userName ?? "",
        reporter_person_id: ctx.personId ?? null,
        headcount: intOrUndef(args.headcount) ?? null,
        details: String(args.details ?? "") || null,
      });
      if (error) return { error: error.message };
      return { ok: true, message: `📨 Got it — ${dept} report filed for today. Thank you!` };
    },
  },
  {
    name: "get_service_summary",
    description:
      "The full picture of a service (default the latest): attendance, salvations, first-timers, preacher, topic, times, the department reports rolled up, and how many children actually checked in.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "Service date YYYY-MM-DD (optional; defaults to today)" } },
      required: [],
    },
    minRank: 2, // leaders
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { found: false };
      const date = serviceDate(args.date);
      const { data: svc } = await db
        .from("services")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("service_date", date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!svc) return { found: false, message: `No service recorded for ${date} yet.` };
      const s = svc as any;

      const [{ data: att }, { data: reports }, { data: kids }] = await Promise.all([
        db.from("service_attendance").select("id").eq("service_id", s.id),
        db.from("service_reports").select("department, headcount, reporter_name, details").eq("service_id", s.id),
        db.from("child_checkins").select("id").eq("workspace_id", ctx.workspaceId).gte("checked_in_at", `${date}T00:00:00`).lte("checked_in_at", `${date}T23:59:59`),
      ]);

      const departmentReports = (reports ?? []).map((r: any) => ({
        department: r.department, headcount: r.headcount ?? null, by: r.reporter_name ?? "", details: r.details ?? "",
      }));
      const departmentHeadcountTotal = departmentReports.reduce((n, d) => n + (d.headcount ?? 0), 0);

      return {
        found: true,
        date,
        serviceType: s.service_type ?? null,
        preacher: s.preacher ?? null,
        topic: s.message_topic ?? null,
        time: [s.start_time, s.end_time].filter(Boolean).join(" – ") || null,
        attendanceAdults: s.attendance_adults ?? null,
        attendanceChildren: s.attendance_children ?? null,
        childrenCheckedIn: (kids ?? []).length,
        selfCheckedIn: (att ?? []).length,
        firstTimers: s.first_timers_count ?? null,
        salvations: s.salvations_count ?? null,
        offering: s.offering_total ?? null,
        departmentReports,
        departmentHeadcountTotal,
        notes: s.notes ?? null,
      };
    },
  },
  {
    name: "list_recent_services",
    description: "Recent services with their headline numbers — for spotting attendance and salvation trends.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "How many (default 6)" } },
      required: [],
    },
    minRank: 2,
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, services: [] };
      const limit = Math.min(Math.max(intOrUndef(args.limit) ?? 6, 1), 20);
      const { data } = await db
        .from("services")
        .select("service_date, service_type, attendance_adults, attendance_children, first_timers_count, salvations_count")
        .eq("workspace_id", ctx.workspaceId)
        .order("service_date", { ascending: false })
        .limit(limit);
      const services = (data ?? []).map((r: any) => ({
        date: r.service_date,
        type: r.service_type,
        adults: r.attendance_adults ?? null,
        children: r.attendance_children ?? null,
        firstTimers: r.first_timers_count ?? null,
        salvations: r.salvations_count ?? null,
      }));
      return { count: services.length, services };
    },
  },
];
