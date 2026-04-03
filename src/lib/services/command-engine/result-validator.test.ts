import { normalizeAiCommandResult } from "@/lib/services/command-engine/result-validator";

describe("normalizeAiCommandResult", () => {
  it("falls back to a safe reply and strips invalid artifacts", () => {
    const result = normalizeAiCommandResult({
      reply: "   ",
      artifact: {
        kind: "unknown-kind" as never,
        headline: "  bad artifact  ",
        supportingText: "ignore",
      },
      generatedIssueReport: {
        id: "issue-1",
        title: "Broken chair",
        area: "Lobby",
        severity: "critical" as never,
        status: "pending",
        mediaCount: 2,
        reportedBy: "Ops",
      },
    });

    expect(result.reply).toBe("Done. Your request has been captured.");
    expect(result.artifact).toBeUndefined();
    expect(result.generatedIssueReport).toBeUndefined();
  });

  it("normalizes valid artifacts and clamps numeric fields", () => {
    const result = normalizeAiCommandResult({
      reply: "  Poll prepared.  ",
      artifact: {
        kind: "poll",
        headline: "  Weekly Pulse ",
        supportingText: "  Ready for responses ",
      },
      generatedPoll: {
        id: "poll-1",
        title: "  Operations Pulse ",
        lane: "pulse",
        audience: "",
        owner: "",
        questionCount: -3,
        responseCount: -9,
        targetCount: -5,
        status: "active",
        updatedAtLabel: "",
      },
    });

    expect(result.reply).toBe("Poll prepared.");
    expect(result.artifact).toEqual({
      kind: "poll",
      headline: "Weekly Pulse",
      supportingText: "Ready for responses",
    });
    expect(result.generatedPoll?.questionCount).toBe(1);
    expect(result.generatedPoll?.responseCount).toBe(0);
    expect(result.generatedPoll?.targetCount).toBe(0);
    expect(result.generatedPoll?.owner).toBe("Chertt AI");
  });
});
