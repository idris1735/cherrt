// Role-aware WhatsApp menus. The same permission machinery that guards tool
// EXECUTION (minRank + dataSensitive, see access.ts) now shapes what each role
// is OFFERED to tap — a member's menu is honestly different from a finance
// officer's or a pastor's, and IT/technical never sees data-reading options.
// Tapping a row feeds a natural-language prompt back through the normal agent
// path, so every existing guard (confirmation gates, consent, role checks)
// still applies.

import { getAgentTool } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import type { AgentContext } from "@/lib/services/agent/tools";

export type MenuItem = {
  id: string;          // stable id — the row id sent to WhatsApp is `menu:${id}`
  title: string;       // WhatsApp row title (emoji included)
  description: string; // WhatsApp row subtitle
  tool: string;        // gating tool — must exist in AGENT_TOOLS
  prompt: string;      // fed to the agent when the row is tapped
  group: "give" | "care" | "children" | "belong" | "ops";
};

// Curated, in display order: universal self-service first, then rank-gated
// actions. Anything not listed here is still reachable by typing — the menu
// is the front door, not the only door.
const MENU_ITEMS: MenuItem[] = [
  // ── give & generosity ──
  { id: "give", tool: "give_now", group: "give", title: "💰 Give", description: "Tithe, offering or seed — recorded", prompt: "I want to give" },
  { id: "record_giving", tool: "record_giving", group: "give", title: "🧾 Record giving", description: "Log cash or transfer received", prompt: "Record giving we received" },
  { id: "giving_month", tool: "get_giving_summary", group: "give", title: "📊 Giving this month", description: "Totals and recent gifts", prompt: "How much giving have we had this month?" },
  // ── care & prayer ──
  { id: "prayer", tool: "capture_prayer_request", group: "care", title: "🕊️ Ask for prayer", description: "Private — to the prayer team only", prompt: "I'd like to submit a prayer request" },
  { id: "pastoral", tool: "request_pastoral_care", group: "care", title: "🤲 See a pastor", description: "Counselling, visits, support", prompt: "I need to see a pastor" },
  { id: "pastoral_form", tool: "submit_pastoral_form", group: "care", title: "📜 Pastoral forms", description: "Dedication · naming · pre-marital · house", prompt: "I want to submit a pastoral form" },
  { id: "life_journey", tool: "register_baptism", group: "care", title: "🌱 Life journeys", description: "Baptism · new believer · bereavement", prompt: "I'd like to start a life journey" },
  // ── children ──
  { id: "checkin", tool: "check_in_child", group: "children", title: "👶 Check in a child", description: "Pickup code + QR pass", prompt: "Check my child in for children's church" },
  { id: "register_child", tool: "register_child", group: "children", title: "🧒 Register a child", description: "Guardian-consented child profile", prompt: "I want to register my child" },
  { id: "checked_in", tool: "list_checked_in_children", group: "children", title: "👧 Checked-in children", description: "Who's in children's church now", prompt: "Show me the checked-in children" },
  // ── belong & community ──
  { id: "join_dept", tool: "join_department", group: "belong", title: "🤝 Join a ministry", description: "Choir, ushering, media, more", prompt: "I want to join a department or ministry" },
  { id: "events", tool: "list_events", group: "belong", title: "📅 Events", description: "See what's coming up", prompt: "What events are coming up?" },
  { id: "register_event", tool: "register_for_event", group: "belong", title: "🎟️ Register for an event", description: "Save your seat", prompt: "I want to register for an event" },
  { id: "qr", tool: "send_qr", group: "belong", title: "🔗 QR codes", description: "Join, giving, kids, parking", prompt: "Send me the QR codes" },
  // ── church ops (rank-gated rows land here) ──
  { id: "first_timer", tool: "capture_first_timer", group: "ops", title: "👋 First-timer", description: "Log a visitor for follow-up", prompt: "I have a first-timer with me" },
  { id: "issue", tool: "report_issue", group: "ops", title: "🛠️ Report an issue", description: "Broken light? Leaking roof?", prompt: "I want to report a facility issue" },
  { id: "record_service", tool: "record_service_summary", group: "ops", title: "📝 Record service", description: "Attendance, offering, sermon", prompt: "I want to record today's service" },
  { id: "announce", tool: "create_announcement", group: "ops", title: "📣 Announce", description: "Message the whole church", prompt: "I want to announce something to everyone" },
  { id: "members", tool: "list_members", group: "ops", title: "👥 Members", description: "Roster with roles", prompt: "Show me our members" },
  { id: "first_timers_list", tool: "list_first_timers", group: "ops", title: "📋 First-timer follow-ups", description: "Who still needs a call", prompt: "Show me first-timers needing follow-up" },
  { id: "prayer_list", tool: "list_prayer_requests", group: "ops", title: "🙏 Open prayer requests", description: "What the prayer team is carrying", prompt: "Show me the open prayer requests" },
  { id: "birthdays", tool: "list_birthdays", group: "ops", title: "🎂 Birthdays", description: "Who's celebrating soon", prompt: "Whose birthdays are coming up?" },
  { id: "add_member", tool: "add_member", group: "ops", title: "➕ Add a member", description: "Register someone new", prompt: "I want to add a new member" },
];

const BY_ID = new Map(MENU_ITEMS.map((m) => [m.id, m]));
const PAGE_SIZE = 9; // 10th row is always the navigation row (WhatsApp list limit)

/**
 * The tappable rows a role should be offered, page 1 or 2. Gating uses the
 * exact same `toolAccessError` the execution path enforces — a row shown is
 * a row the caller is actually allowed to use.
 */
export function menuForRole(role: string, page = 1): Array<{ id: string; title: string; description: string }> {
  const ctx: AgentContext = { workspaceId: "", role: role as AgentContext["role"] };
  const visible = MENU_ITEMS.filter((m) => {
    const tool = getAgentTool(m.tool);
    if (!tool) return false;
    return !toolAccessError(tool, ctx);
  });
  const start = (page - 1) * PAGE_SIZE;
  const rows = visible
    .slice(start, start + PAGE_SIZE)
    .map((m) => ({ id: `menu:${m.id}`, title: m.title, description: m.description }));
  const hasMore = start + PAGE_SIZE < visible.length;
  rows.push(
    hasMore
      ? { id: "menu_more", title: "💡 More actions →", description: "See the rest of what you can do" }
      : { id: "help_more", title: "💡 Help & guides", description: "Everything else Chertt can do" },
  );
  return rows;
}

/** The prompt a tapped row should feed to the agent, or null for nav rows. */
export function menuPromptFor(id: string): string | null {
  return BY_ID.get(id)?.prompt ?? null;
}
