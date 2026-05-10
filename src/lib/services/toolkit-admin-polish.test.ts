import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/services/csv-export";
import { parseSubmissionResponses } from "@/lib/services/form-submissions";
import { resolveOnboardingStatus } from "@/lib/services/onboarding-admin";

describe("toolkit admin polish helpers", () => {
  it("parses keyed form response lines", () => {
    expect(parseSubmissionResponses("Department: Finance\nNeed: Printer ink\nLoose answer")).toEqual({
      Department: "Finance",
      Need: "Printer ink",
      "Answer 3": "Loose answer",
    });
  });

  it("escapes CSV values", () => {
    const csv = toCsv([{ name: "Ada, Ops", note: 'Needs "approval"' }], [
      { header: "Name", value: (row) => row.name },
      { header: "Note", value: (row) => row.note },
    ]);

    expect(csv).toContain('"Ada, Ops"');
    expect(csv).toContain('"Needs ""approval"""');
  });

  it("resolves onboarding status from completed step count", () => {
    expect(resolveOnboardingStatus([], 4)).toBe("not-started");
    expect(resolveOnboardingStatus(["Create profile"], 4)).toBe("in-progress");
    expect(resolveOnboardingStatus(["A", "B", "C", "D"], 4)).toBe("completed");
  });
});
