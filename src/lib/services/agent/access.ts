// Role gating for agent tools. Every sensitive tool declares a `minRank`; this
// enforces it against the caller's role. Member self-service tools (request
// prayer, give, register) declare no minRank and are open. Fails closed: an
// unknown role ranks as 0 (member), so it can't reach gated tools.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md and the
// Fable security review (CHRONICLE §0, 2026-07-22).

import { roleRank } from "@/lib/services/identity/role-catalog";
import type { AgentContext, AgentTool } from "@/lib/services/agent/tools";

// Returns null when the caller may use the tool, or a user-facing refusal
// message when they may not.
export function toolAccessError(tool: AgentTool, ctx: AgentContext): string | null {
  if (tool.minRank === undefined) return null;
  if (roleRank(ctx.role) >= tool.minRank) return null;
  return "You don't have permission to do that here — please ask a church admin or the relevant leader.";
}
