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
    minRank: 3, // finance and above — expenses hit the financial ledger
    mutates: true,
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
    mutates: true, // any member may report a fault — no minRank
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
    name: "track_supply",
    description:
      "Track a church supply or resource — communion cups, children's-church materials, chairs, equipment — and how many you have. Use when someone wants to record or restock supplies.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "What it is, e.g. 'Communion cups'" },
        quantity: { type: "number", description: "How many you have now" },
        lowAt: { type: "number", description: "Flag as low when it drops to this (optional)" },
        location: { type: "string", description: "Where it's kept (optional)" },
      },
      required: ["name", "quantity"],
    },
    minRank: 2,
    mutates: true,
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      const quantity = Number(args.quantity);
      if (!name || !Number.isFinite(quantity) || quantity < 0) {
        return { error: "Need a supply name and how many you have." };
      }
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const lowAtRaw = Number(args.lowAt);
      const { error } = await db.from("toolkit_inventory_items").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        name,
        in_stock: quantity,
        min_level: Number.isFinite(lowAtRaw) ? lowAtRaw : 0,
        location: String(args.location ?? ""),
      });
      if (error) return { error: error.message };
      return { ok: true, message: `✅ Tracked *${name}* — ${quantity} in store.` };
    },
  },
  {
    name: "draft_document",
    description:
      "Draft a letter or memo. YOU write the full body text in the 'body' argument. This is consequential, so it is saved only after the user confirms.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title" },
        type: { type: "string", description: "letter or memo" },
        body: { type: "string", description: "The full drafted document text you have written" },
      },
      required: ["title", "body"],
    },
    requiresConfirmation: true,
    minRank: 2, // secretary and above draft official documents
    mutates: true,
    preview: (args) => `📄 Draft this ${String(args.type || "document")}: *${String(args.title || "Untitled")}*?`,
    handler: async (args, ctx) => {
      const title = String(args.title ?? "").trim();
      const body = String(args.body ?? "").trim();
      if (!title || !body) return { error: "Need a title and body." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const type = ["letter", "memo"].includes(String(args.type)) ? String(args.type) : "letter";
      const { error } = await db.from("smart_documents").insert({
        id: newId(),
        workspace_id: ctx.workspaceId,
        title,
        document_type: type,
        body,
        status: "pending",
        prepared_by: ctx.userName ?? "You",
        awaiting_signature_from: "Workspace approver",
      });
      if (error) return { error: error.message };
      return { ok: true, message: `📄 Draft saved: *${title}*. It's pending sign-off.` };
    },
  },
];
