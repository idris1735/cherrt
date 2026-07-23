// Write-audit for agent tool calls: who (person + role), what tool, what args,
// and the outcome. First-class and queryable — important for money and
// children ("wait, who logged this?"). Best-effort: never blocks or breaks a
// tool if the audit insert fails. See the Fable review (CHRONICLE §0).

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentContext } from "@/lib/services/agent/tools";

export type ToolOutcome = "ok" | "error" | "denied";

export async function recordToolAudit(
  ctx: AgentContext,
  toolName: string,
  args: Record<string, unknown>,
  outcome: ToolOutcome,
): Promise<void> {
  const db = getSupabaseServerClient();
  if (!db || !ctx.workspaceId) return; // guest / workspace-less calls aren't audited
  try {
    await db.from("agent_tool_audit").insert({
      id: randomUUID(),
      workspace_id: ctx.workspaceId,
      actor_person_id: ctx.personId ?? null,
      actor_name: ctx.userName ?? "",
      actor_role: ctx.role,
      tool_name: toolName,
      args,
      outcome,
    });
  } catch {
    // best-effort; auditing must never break the action itself
  }
}
