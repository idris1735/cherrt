// Agent tool registry. Typed tools the tool-calling loop can invoke, each
// wired to an existing workspace-scoped service. v1 is read-only (no side
// effects); action tools land in a later increment behind the confirmation
// gate. See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getGivingSummary, loadWorkspaceContext } from "@/lib/services/whatsapp-workspace";
import { listBranchMembers } from "@/lib/services/identity/provisioning";
import type { Role } from "@/lib/types";

export type AgentContext = {
  workspaceId: string;
  role: Role;
  userName?: string;
  // The sender's WhatsApp number, so tools can store a reachable contact for
  // later proactive/scheduled follow-up (e.g. daily discipleship content).
  phone?: string;
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
    handler: async (_args, ctx) => {
      const c = await loadWorkspaceContext(ctx.workspaceId);
      return { count: c.pendingRequests.length, requests: c.pendingRequests };
    },
  },
  {
    name: "get_low_stock",
    description: "Inventory items at or below their minimum stock level.",
    parameters: NO_PARAMS,
    handler: async (_args, ctx) => {
      const c = await loadWorkspaceContext(ctx.workspaceId);
      return { count: c.lowInventoryItems.length, items: c.lowInventoryItems };
    },
  },
  {
    name: "get_open_issues",
    description: "Open facility and issue reports in this workspace.",
    parameters: NO_PARAMS,
    handler: async (_args, ctx) => {
      const c = await loadWorkspaceContext(ctx.workspaceId);
      return { count: c.pendingIssues.length, issues: c.pendingIssues };
    },
  },
  {
    name: "list_members",
    description: "People who belong to this branch and their roles.",
    parameters: NO_PARAMS,
    handler: async (_args, ctx) => {
      const members = await listBranchMembers(ctx.workspaceId);
      return { count: members.length, members };
    },
  },
];

export function getReadTool(name: string): AgentTool | undefined {
  return READ_TOOLS.find((t) => t.name === name);
}
