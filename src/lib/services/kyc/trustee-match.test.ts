import { describe, it, expect } from "vitest";
import { matchTrustee } from "@/lib/services/kyc/trustee-match";

describe("matchTrustee", () => {
  const trustees = [{ surname: "Obi", firstname: "Ada" }, { surname: "Bello", firstname: "Daniel" }];
  it("matches on both names in any order/case", () => {
    expect(matchTrustee("Ada Obi", trustees)).toBe("match");
    expect(matchTrustee("obi ada grace", trustees)).toBe("match");
  });
  it("no_match when the name isn't a trustee", () => {
    expect(matchTrustee("Samuel Eze", trustees)).toBe("no_match");
  });
  it("unknown when there are no trustees to compare", () => {
    expect(matchTrustee("Ada Obi", [])).toBe("unknown");
  });
});
