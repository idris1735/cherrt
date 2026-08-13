// Agent tool registry. Typed tools the tool-calling loop can invoke, each
// wired to an existing workspace-scoped service. v1 is read-only (no side
// effects); action tools land in a later increment behind the confirmation
// gate. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getGivingSummary, loadWorkspaceContext } from "@/lib/services/whatsapp-workspace";
import { listBranchMembers } from "@/lib/services/identity/provisioning";
import { getKnownProfile, type KnownProfile } from "@/lib/services/identity/people";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { Role } from "@/lib/types";

export type AgentContext = {
  workspaceId: string;
  role: Role;
  userName?: string;
  // The sender's WhatsApp number, so tools can store a reachable contact for
  // later proactive/scheduled follow-up (e.g. daily discipleship content).
  phone?: string;
  // Stable person id (from the identity spine). Records store this so recall /
  // history is by id, not name-string. Undefined only when resolved via the
  // legacy phone_links fallback.
  personId?: string;
  // WS1 — everything already stored about this person. Tools prefill from it
  // and the persona is told to confirm instead of re-asking. Undefined when
  // the profile couldn't be loaded (guest / new person).
  knownProfile?: KnownProfile;
};

// JSON-schema-shaped parameter declaration, matching Gemini functionDeclarations.
export type ToolParameters = {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: ToolParameters;
  // When true, the loop does NOT execute the tool during reasoning; it surfaces
  // a pending action for the user to confirm, and the handler runs only after a
  // "YES" (used for consequential actions — documents, payments, giving).
  requiresConfirmation?: boolean;
  // Human-readable confirmation prompt built from the proposed args.
  preview?: (args: Record<string, unknown>) => string;
  // Minimum role rank (see role-catalog) required to use this tool. Undefined =
  // available to any linked member (self-service actions, public reads).
  minRank?: number;
  // True if the tool writes/changes data — used to filter tools out in a
  // workspace's read-only agent mode.
  mutates?: boolean;
  // True if the tool reads or exposes church data (giving, members, prayer,
  // PII). IT/technical may configure the church but never read its data, so
  // these are denied to that role regardless of rank (see access.ts).
  dataSensitive?: boolean;
  // Handlers are workspace-scoped via ctx and return JSON-serializable data.
  handler: (args: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
};

// All v1 tools derive their scope from ctx.workspaceId and take no arguments.
const NO_PARAMS: ToolParameters = { type: "object", properties: {} };

export const READ_TOOLS: AgentTool[] = [
  {
    name: "get_giving_summary",
    description:
      "Giving totals for this workspace: amount and count this month, last month, and a breakdown by giving type.",
    parameters: NO_PARAMS,
    minRank: 3, // finance and above
    dataSensitive: true,
    handler: async (_args, ctx) => {
      const g = await getGivingSummary(ctx.workspaceId);
      return {
        totalThisMonth: g.totalThisMonth,
        totalLastMonth: g.totalLastMonth,
        countThisMonth: g.countThisMonth,
        byType: g.byType,
      };
    },
  },
  {
    name: "get_pending_requests",
    description: "Requests and approvals currently pending in this workspace.",
    parameters: NO_PARAMS,
    minRank: 2, // secretary/operations and above
    dataSensitive: true,
    handler: async (_args, ctx) => {
      const c = await loadWorkspaceContext(ctx.workspaceId);
      return { count: c.pendingRequests.length, requests: c.pendingRequests };
    },
  },
  {
    name: "get_low_supplies",
    description: "Church supplies or resources running low and needing a restock.",
    parameters: NO_PARAMS,
    minRank: 2,
    handler: async (_args, ctx) => {
      const c = await loadWorkspaceContext(ctx.workspaceId);
      return { count: c.lowInventoryItems.length, supplies: c.lowInventoryItems };
    },
  },
  {
    name: "get_open_issues",
    description: "Open facility and maintenance issues at the church.",
    parameters: NO_PARAMS,
    minRank: 2,
    handler: async (_args, ctx) => {
      const c = await loadWorkspaceContext(ctx.workspaceId);
      return { count: c.pendingIssues.length, issues: c.pendingIssues };
    },
  },
  {
    name: "list_members",
    description: "People who belong to this branch and their roles.",
    parameters: NO_PARAMS,
    minRank: 2, // roster is leadership-only
    dataSensitive: true,
    handler: async (_args, ctx) => {
      const members = await listBranchMembers(ctx.workspaceId);
      return { count: members.length, members };
    },
  },
  {
    // WS1 — the agent can check what's already stored before asking, so a
    // field on file is never re-requested ("Still on 0803…?" beats asking).
    name: "lookup_person",
    description: "What we already have on file about one person in this church: their stored name, phone, email, gender, birthdate, address, marital status, and memberships. Use this BEFORE asking for any of those details — if a field is already stored, confirm it instead of asking again.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Their name (or part of it)" },
        phone: { type: "string", description: "Their phone number (optional)" },
      },
    },
    dataSensitive: true,
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim().toLowerCase();
      const phone = String(args.phone ?? "").trim();
      // Find the person in this workspace: by membership roster first.
      const members = (await listBranchMembers(ctx.workspaceId)) as ({ person_id?: string; personId?: string; name?: string; fullName?: string; phone?: string }[] | null);
      const roster = members ?? [];
      const hits = roster.filter((m) => {
        const storedName = String(m.fullName ?? m.name ?? "").toLowerCase();
        const storedPhone = String(m.phone ?? "");
        return (name && storedName.includes(name)) || (phone && storedPhone.includes(phone));
      });
      const personId = hits[0]?.personId ?? hits[0]?.person_id;
      if (!personId) return { found: false, message: "No one on file here matches that." };
      const profile = await getKnownProfile(personId);
      if (!profile) return { found: false, message: "No one on file here matches that." };
      return { found: true, profile };
    },
  },
];

export function getReadTool(name: string): AgentTool | undefined {
  return READ_TOOLS.find((t) => t.name === name);
}
