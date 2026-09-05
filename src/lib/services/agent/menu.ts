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
  { id: "hold_seat", tool: "hold_seat", group: "children", title: "🪑 Reserve a seat", description: "Pre-check-in a spot for Sunday", prompt: "I want to reserve a seat for my child" },
  { id: "arrive", tool: "hold_seat", group: "children", title: "🙋 I've arrived", description: "Check in a reserved seat", prompt: "We've arrived — check in our reserved seat" },
  { id: "register_child", tool: "register_child", group: "children", title: "🧒 Register a child", description: "Guardian-consented child profile", prompt: "I want to register my child" },
  { id: "checked_in", tool: "list_checked_in_children", group: "children", title: "👧 Checked-in children", description: "Who's in children's church now", prompt: "Show me the checked-in children" },
  { id: "accept_arrivals", tool: "accept_arrival", group: "children", title: "🙌 Accept arrivals", description: "Mark checked-in kids as arrived in class", prompt: "Accept children into class" },
  { id: "classrooms", tool: "list_classrooms", group: "children", title: "🏫 Classrooms", description: "Rooms with occupancy & capacity", prompt: "Show the classrooms" },
  { id: "add_classroom", tool: "create_classroom", group: "children", title: "🏫 Add classroom", description: "Set up a room + capacity", prompt: "I want to add a classroom" },
  // ── belong & community ──
  { id: "join_dept", tool: "join_department", group: "belong", title: "🤝 Join a ministry", description: "Choir, ushering, media, more", prompt: "I want to join a department or ministry" },
  { id: "volunteer", tool: "volunteer_signup", group: "belong", title: "🙋 Volunteer", description: "Offer to serve where there's a need", prompt: "I want to volunteer to serve" },
  { id: "my_birthday", tool: "set_birthday", group: "belong", title: "🎂 My birthday", description: "So your church can celebrate you", prompt: "I want to set my birthday" },
  { id: "lost_found", tool: "report_lost_or_found", group: "ops", title: "🔎 Lost & found", description: "Report a lost or found item", prompt: "I lost or found something" },
  { id: "request_volunteers", tool: "request_volunteers", group: "ops", title: "📣 Request volunteers", description: "Put out a call to serve", prompt: "I need volunteers" },
  { id: "office_guest", tool: "register_office_guest", group: "ops", title: "🪪 Office visitor", description: "Sign in someone visiting the office", prompt: "Sign in an office visitor" },
  { id: "events", tool: "list_events", group: "belong", title: "📅 Events", description: "See what's coming up", prompt: "What events are coming up?" },
  { id: "register_event", tool: "register_for_event", group: "belong", title: "🎟️ Register for an event", description: "Save your seat", prompt: "I want to register for an event" },
  { id: "create_event", tool: "create_event", group: "belong", title: "➕ Create an event", description: "Add something to the calendar", prompt: "I want to create an event" },
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

// ── Two-level menu (2026-09-05) ──────────────────────────────────────────────
// The flat menu grew to ~40 rows / several pages for a creator. The top level is
// now a short list of GROUPS; tapping one opens its items — as tappable BUTTONS
// when there are ≤3 (one tap, no modal), else a list. Addresses the client's
// directness feedback: small menus shouldn't force a modal.
export const MENU_GROUPS: Array<{ id: MenuItem["group"]; title: string; description: string }> = [
  { id: "children", title: "👶 Children", description: "Check-in, classrooms, registration" },
  { id: "give", title: "💰 Giving & money", description: "Give, record, reports" },
  { id: "care", title: "🙏 Care & prayer", description: "Prayer, pastoral care, forms" },
  { id: "belong", title: "🤝 Belong", description: "Ministries, events, QR codes" },
  { id: "ops", title: "⚙️ Church ops", description: "Members, service, admin" },
];

function visibleItems(role: string, group?: MenuItem["group"]): MenuItem[] {
  const ctx: AgentContext = { workspaceId: "", role: role as AgentContext["role"] };
  return MENU_ITEMS.filter((m) => {
    if (group && m.group !== group) return false;
    const tool = getAgentTool(m.tool);
    if (!tool) return false;
    return !toolAccessError(tool, ctx);
  });
}

/** Top-level menu: the groups this role has at least one visible item in. */
export function menuGroupsForRole(role: string): Array<{ id: string; title: string; description: string }> {
  return MENU_GROUPS
    .filter((g) => visibleItems(role, g.id).length > 0)
    .map((g) => ({ id: `grp:${g.id}`, title: g.title, description: g.description }));
}

/**
 * A group's items for a role — as buttons when ≤3 (one tap, no modal), else a
 * paginated list. Button titles are capped at 20 chars (WhatsApp limit).
 */
export function menuItemsForGroup(role: string, group: string, page = 1): {
  asButtons: boolean;
  header: string;
  items: Array<{ id: string; title: string; description?: string }>;
  hasMore: boolean;
} {
  const meta = MENU_GROUPS.find((g) => g.id === group);
  const header = meta?.title ?? "Menu";
  const visible = visibleItems(role, group as MenuItem["group"]);
  if (visible.length <= 3) {
    return { asButtons: true, header, items: visible.map((m) => ({ id: `menu:${m.id}`, title: m.title.slice(0, 20) })), hasMore: false };
  }
  const start = (page - 1) * PAGE_SIZE;
  const slice = visible.slice(start, start + PAGE_SIZE);
  return {
    asButtons: false,
    header,
    items: slice.map((m) => ({ id: `menu:${m.id}`, title: m.title, description: m.description })),
    hasMore: start + PAGE_SIZE < visible.length,
  };
}

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
      ? { id: `menu_more:${page + 1}`, title: "💡 More actions →", description: "See the rest of what you can do" }
      : { id: "help_more", title: "💡 Help & guides", description: "Everything else Chertt can do" },
  );
  return rows;
}

/** The prompt a tapped row should feed to the agent, or null for nav rows. */
export function menuPromptFor(id: string): string | null {
  return BY_ID.get(id)?.prompt ?? null;
}
