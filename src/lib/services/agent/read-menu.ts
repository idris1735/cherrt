// Direct reads for menu rows — no LLM in the loop. Tapping a read row calls the
// read tool directly and formats the result deterministically (faster, cheaper,
// never wanders). Same access check the agent path applied (toolAccessError),
// so rank/dataSensitive gating is preserved.
import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { AgentContext } from "@/lib/services/agent/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */
function naira(n: unknown): string { return "₦" + Number(n || 0).toLocaleString("en-NG"); }

type Reader = { tool: string; format: (res: any) => string };

// Keyed by menu row id (the part after "menu:").
const READS: Record<string, Reader> = {
  giving_month: {
    tool: "get_giving_summary",
    format: (r) => {
      const lines = [
        "💰 *Giving this month*",
        `Total: ${naira(r.totalThisMonth)} (${r.countThisMonth ?? 0} gift${r.countThisMonth === 1 ? "" : "s"})`,
        `Last month: ${naira(r.totalLastMonth)}`,
      ];
      const byType = (r.byType ?? {}) as Record<string, number>;
      const parts = Object.entries(byType).map(([k, v]) => `  • ${k}: ${naira(v)}`);
      if (parts.length) lines.push("By type:", ...parts);
      return lines.join("\n");
    },
  },
  checked_in: {
    tool: "list_checked_in_children",
    format: (r) => {
      const kids = (r.children ?? []) as any[];
      if (!kids.length) return "👧 No children are checked in right now.";
      return [`👧 *Checked-in children (${r.count ?? kids.length})*`,
        ...kids.slice(0, 20).map((c) => `• ${c.name}${c.age ? `, age ${c.age}` : ""}${c.guardian ? ` — ${c.guardian}` : ""}${c.allergies ? ` ⚠️ ${c.allergies}` : ""}`)].join("\n");
    },
  },
  events: {
    tool: "list_events",
    format: (r) => {
      const ev = (r.events ?? []) as any[];
      if (!ev.length) return "📅 No upcoming events right now.";
      return [`📅 *Upcoming events (${r.count ?? ev.length})*`,
        ...ev.slice(0, 20).map((e) => `• ${e.title}${e.date ? ` — ${e.date}` : ""}${e.venue ? ` · ${e.venue}` : ""}`)].join("\n");
    },
  },
  members: {
    tool: "list_members",
    format: (r) => {
      const m = (r.members ?? []) as any[];
      if (!m.length) return "👥 No members on the roster yet.";
      const rows = m.slice(0, 25).map((x) => `• ${x.fullName || "—"}${x.role && x.role !== "member" ? ` — ${x.role}` : ""}`);
      const more = m.length > 25 ? `\n…and ${m.length - 25} more.` : "";
      return `👥 *Members (${r.count ?? m.length})*\n${rows.join("\n")}${more}`;
    },
  },
  first_timers_list: {
    tool: "list_first_timers",
    format: (r) => {
      const ft = (r.firstTimers ?? []) as any[];
      if (!ft.length) return "📋 No first-timers logged yet.";
      return [`📋 *First-timers (${r.count ?? ft.length})*`,
        ...ft.slice(0, 20).map((f) => `• ${f.name}${f.phone ? ` — ${f.phone}` : ""}${f.status ? ` · ${f.status}` : ""}`)].join("\n");
    },
  },
  prayer_list: {
    tool: "list_prayer_requests",
    format: (r) => {
      const req = (r.requests ?? []) as any[];
      if (!req.length) return "🙏 No open prayer requests right now.";
      return [`🙏 *Open prayer requests (${r.count ?? req.length})*`,
        ...req.slice(0, 20).map((p) => `• ${p.from}: ${p.request}`)].join("\n");
    },
  },
  birthdays: {
    tool: "list_birthdays",
    format: (r) => {
      const b = (r.birthdays ?? []) as any[];
      if (!b.length) return "🎂 No birthdays coming up.";
      return [`🎂 *Birthdays (${r.count ?? b.length})*`,
        ...b.slice(0, 20).map((x) => `• ${x.name} — ${x.day}/${x.month}`)].join("\n");
    },
  },
};

// Returns the formatted reply for a read menu row, an access-denied message, or
// null when this isn't a direct-read row (caller falls through to the agent).
export async function runMenuRead(buttonId: string, ctx: AgentContext): Promise<string | null> {
  if (!buttonId.startsWith("menu:")) return null;
  const reader = READS[buttonId.slice(5)];
  if (!reader) return null;
  const tool = getAgentTool(reader.tool);
  if (!tool) return null;
  const denied = toolAccessError(tool, ctx);
  if (denied) return denied;
  try {
    const res = await tool.handler({}, ctx);
    return reader.format(res);
  } catch {
    return "Sorry — I couldn't fetch that just now. Please try again.";
  }
}
