// The "it remembers" layer. Before an agent turn, gather what the church knows
// about this member — recent prayer requests, pastoral care, active life
// journeys, recent giving — and hand it to the agent as memory so it can follow
// up warmly and naturally. Read-only, scoped to the member's name within their
// workspace. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentContext } from "@/lib/services/agent/tools";

// Rough, human "time ago" for context — precision isn't the point, warmth is.
function ago(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return "recently";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"} ago`;
}

type Row = Record<string, unknown>;
const rows = (r: { data?: unknown[] | null } | undefined): Row[] => (r?.data as Row[] | undefined) ?? [];

// Returns a compact memory block to prepend to the agent's system prompt, or an
// empty string when there's nothing worth recalling (guests, brand-new people).
export async function buildMemberContext(ctx: AgentContext): Promise<string> {
  const db = getSupabaseServerClient();
  const name = (ctx.userName ?? "").trim();
  const pid = ctx.personId;
  if (!db || (!pid && !name)) return "";
  const ws = ctx.workspaceId;

  // Prefer the stable person_id so two members with the same display name never
  // see each other's history; fall back to name only for legacy-resolved
  // callers that have no person_id.
  const by = (nameCol: string): { col: string; val: string } =>
    pid ? { col: "person_id", val: pid } : { col: nameCol, val: name };
  const [p, c, j, g] = [by("requester_name"), by("requester_name"), by("person_name"), by("donor_name")];

  const [prayers, care, journeys, giving] = await Promise.all([
    db.from("prayer_requests").select("request, created_at").eq("workspace_id", ws).eq(p.col, p.val).order("created_at", { ascending: false }).limit(2),
    db.from("pastoral_care_requests").select("category, created_at").eq("workspace_id", ws).eq(c.col, c.val).eq("status", "open").order("created_at", { ascending: false }).limit(1),
    db.from("life_journeys").select("journey_type, created_at").eq("workspace_id", ws).eq(j.col, j.val).eq("status", "active").order("created_at", { ascending: false }).limit(2),
    db.from("giving_records").select("amount, giving_type, created_at").eq("workspace_id", ws).eq(g.col, g.val).order("created_at", { ascending: false }).limit(1),
  ]);

  const lines: string[] = [];
  for (const p of rows(prayers)) lines.push(`- Prayer request: "${String(p.request ?? "")}" (${ago(String(p.created_at ?? ""))})`);
  for (const c of rows(care)) lines.push(`- Open pastoral-care request: ${String(c.category ?? "general")} (${ago(String(c.created_at ?? ""))})`);
  for (const j of rows(journeys)) lines.push(`- Currently in the ${String(j.journey_type ?? "").replace(/_/g, " ")} journey (since ${ago(String(j.created_at ?? ""))})`);
  for (const g of rows(giving)) lines.push(`- Recent giving: ₦${Number(g.amount ?? 0).toLocaleString("en-NG")} ${String(g.giving_type ?? "")}`.trim());

  if (!lines.length) return "";
  return [
    "",
    "",
    `[What we remember about ${name} — reference gently and warmly ONLY if it fits the conversation; never recite this back as a list, and never bring up a sensitive item unprompted more than once]`,
    ...lines,
  ].join("\n");
}
