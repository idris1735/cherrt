// Agent action tools — the creations the existing system makes WITHOUT a
// confirmation gate (expense, issue, inventory). Consequential actions
// (documents, payments, giving, high-value requests) are deliberately NOT here
// yet; they stay with the single-shot creator until the agent gets a proper
// pending-confirmation mechanism. See
// docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const ACTION_TOOLS: AgentTool[] = [
  {
    name: "log_expense",
    description:
      "Record a petty-cash / expense entry. Use when the user says they spent or paid money and want it logged.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the money was spent on, e.g. 'Diesel for generator'" },
        amount: { type: "number", description: "Amount in Naira" },
        department: { type: "string", description: "Department or category (optional)" },
      },
      required: ["title", "amount"],
    },
    handler: async (args, ctx) => {
      const title = String(args.title ?? "").trim();
      const amount = Number(args.amount);
      if (!title || !Number.isFinite(amount) || amount <= 0) {
        return { error: "Need a description and a positive amount." };
      }
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("toolkit_expense_entries").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        title,
        department: String(args.department ?? "General") || "General",
        amount,
        status: "pending",
      });
      if (error) return { error: error.message };
      return { ok: true, logged: { title, amount } };
    },
  },
  {
    name: "report_issue",
    description:
      "Report a facility or maintenance issue. Use when the user reports something broken or needing repair.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The problem, e.g. 'Toilet not flushing'" },
        area: { type: "string", description: "Location or area (optional)" },
        severity: { type: "string", description: "low, medium, or high (optional)" },
      },
      required: ["title"],
    },
    handler: async (args, ctx) => {
      const title = String(args.title ?? "").trim();
      if (!title) return { error: "Need a description of the issue." };
      const sev = String(args.severity ?? "medium").toLowerCase();
      const severity = ["low", "medium", "high"].includes(sev) ? sev : "medium";
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("toolkit_issue_reports").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        title,
        area: String(args.area ?? "General") || "General",
        severity,
        status: "pending",
        reported_by: ctx.userName ?? "You",
      });
      if (error) return { error: error.message };
      return { ok: true, reported: { title, severity } };
    },
  },
  {
    name: "add_inventory_item",
    description: "Add or restock an inventory item. Use when the user wants to track stock of something.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name" },
        inStock: { type: "number", description: "Quantity currently in stock" },
        minLevel: { type: "number", description: "Reorder threshold (optional)" },
        location: { type: "string", description: "Where it's stored (optional)" },
      },
      required: ["name", "inStock"],
    },
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      const inStock = Number(args.inStock);
      if (!name || !Number.isFinite(inStock) || inStock < 0) {
        return { error: "Need an item name and a stock count." };
      }
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const minLevelRaw = Number(args.minLevel);
      const { error } = await db.from("toolkit_inventory_items").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        name,
        in_stock: inStock,
        min_level: Number.isFinite(minLevelRaw) ? minLevelRaw : 0,
        location: String(args.location ?? ""),
      });
      if (error) return { error: error.message };
      return { ok: true, added: { name, inStock } };
    },
  },
];
