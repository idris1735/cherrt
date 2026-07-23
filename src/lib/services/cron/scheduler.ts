// Scheduled jobs, run daily by the Vercel Cron endpoint (app/api/cron/route.ts).
// Each job is isolated and returns a count so the endpoint can report a summary.
//
// DELIVERY CAVEAT (same as announcements): free-form WhatsApp messages only
// reach members inside their 24h session window; reliable proactive/cold sends
// need approved templates. `notifyMember` sends free-form for now — swap it for
// a template send once WHATSAPP_TEMPLATE_* are approved.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { sendTextMessage } from "@/lib/services/whatsapp";
import { DISCIPLESHIP_PLAN } from "@/lib/services/cron/discipleship-plan";

export type JobResult = { job: string; processed: number; sent: number };

async function notifyMember(phone: string, text: string): Promise<boolean> {
  try {
    await sendTextMessage(phone, text);
    return true;
  } catch {
    return false;
  }
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return -1;
  return Math.floor((Date.now() - then) / 86_400_000);
}

// Sends each active discipleship enrolee the message for their current day, and
// marks the journey complete once the plan is finished. Idempotency note: this
// assumes one run per day; a same-day double-run would resend. A per-day "last
// sent" marker on the row is the follow-up if runs ever overlap.
export async function deliverDiscipleshipDay(): Promise<JobResult> {
  const db = getSupabaseServerClient();
  if (!db) return { job: "discipleship-daily", processed: 0, sent: 0 };

  const { data } = await db
    .from("life_journeys")
    .select("id, details, created_at")
    .eq("journey_type", "discipleship")
    .eq("status", "active")
    .limit(500);

  let processed = 0;
  let sent = 0;
  for (const row of (data ?? []) as Array<{ id: string; details?: Record<string, unknown>; created_at: string }>) {
    processed++;
    const day = daysSince(row.created_at);
    if (day < 0) continue;

    if (day >= DISCIPLESHIP_PLAN.length) {
      await db.from("life_journeys").update({ status: "completed" }).eq("id", row.id);
      continue;
    }

    const phone = String(row.details?.phone ?? "");
    if (!phone) continue;
    const lesson = DISCIPLESHIP_PLAN[day];
    const text = `📖 *Day ${day + 1}: ${lesson.title}*\n\n${lesson.verse}\n\n${lesson.thought}`;
    if (await notifyMember(phone, text)) sent++;
  }

  return { job: "discipleship-daily", processed, sent };
}

// Greets everyone whose birthday is today. Resolves each celebrant's active
// phone via their person → phone_contacts, then sends a warm message.
export async function sendBirthdayGreetings(): Promise<JobResult> {
  const db = getSupabaseServerClient();
  if (!db) return { job: "birthday-greetings", processed: 0, sent: 0 };
  const now = new Date();
  const { data: people } = await db
    .from("people")
    .select("id, full_name")
    .eq("birth_day", now.getDate())
    .eq("birth_month", now.getMonth() + 1)
    .limit(500);

  let processed = 0;
  let sent = 0;
  for (const p of (people ?? []) as Array<{ id: string; full_name?: string }>) {
    processed++;
    const { data: contact } = await db
      .from("phone_contacts")
      .select("phone_number")
      .eq("person_id", p.id)
      .eq("status", "active")
      .maybeSingle();
    const phone = (contact as { phone_number?: string } | null)?.phone_number;
    if (!phone) continue;
    const first = (p.full_name ?? "").split(" ")[0] || "friend";
    if (await notifyMember(phone, `🎉 Happy Birthday, ${first}! 🎂 The whole church family is celebrating you today. May this new year overflow with God's goodness. 🙏`)) sent++;
  }
  return { job: "birthday-greetings", processed, sent };
}

// Add further daily jobs here (event reminders, missed-Sunday follow-ups) as
// their data/consent prerequisites are met.
export async function runScheduledJobs(): Promise<JobResult[]> {
  const jobs = [deliverDiscipleshipDay, sendBirthdayGreetings];
  const results: JobResult[] = [];
  for (const job of jobs) {
    try {
      results.push(await job());
    } catch (e) {
      results.push({ job: job.name, processed: 0, sent: 0 });
      console.error(`Scheduled job ${job.name} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return results;
}
