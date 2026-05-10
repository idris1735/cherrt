import { describe, expect, it } from "vitest";

import { parseKnowledgeTags } from "@/lib/services/knowledge-admin";

describe("knowledge admin helpers", () => {
  it("normalizes comma separated tags", () => {
    expect(parseKnowledgeTags(" finance, receipts, , approval ")).toEqual(["finance", "receipts", "approval"]);
  });

  it("caps tags at twelve entries", () => {
    const tags = Array.from({ length: 20 }, (_, index) => `tag-${index}`).join(",");
    expect(parseKnowledgeTags(tags)).toHaveLength(12);
  });
});

