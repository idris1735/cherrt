// Pure quorum resolution. No DB, no side effects — the decision math only.
// Approvers are identified by phone; each decision is recorded once per
// approver (their latest decision wins on replay).

export type Decision = { by: string; decision: "approve" | "decline"; at: string };
export type Quorum = "any" | "all" | "n_of_m";

export function recordDecision(decisions: Decision[], approver: string, decision: "approve" | "decline", at: string): Decision[] {
  const rest = decisions.filter((d) => d.by !== approver);
  return [...rest, { by: approver, decision, at }];
}

// Resolves the request status after a decision is recorded.
// - any: the first decision is final.
// - n_of_m: `required` approvals decide; declines become final once the
//   remaining approvers can no longer reach the requirement.
// - all: every approver must approve; one decline is final.
export function resolveQuorum(
  quorum: Quorum,
  required: number,
  totalApprovers: number,
  decisions: Decision[],
): "open" | "approved" | "declined" {
  const approvals = decisions.filter((d) => d.decision === "approve").length;
  const declines = decisions.filter((d) => d.decision === "decline").length;
  const total = Math.max(totalApprovers, required, 1);

  switch (quorum) {
    case "any":
      return approvals > 0 ? "approved" : declines > 0 ? "declined" : "open";
    case "n_of_m": {
      if (approvals >= required) return "approved";
      // Even if every remaining approver says yes, the requirement is unreachable.
      if (declines > total - required) return "declined";
      return "open";
    }
    case "all": {
      if (declines > 0) return "declined";
      return approvals >= total ? "approved" : "open";
    }
  }
}
