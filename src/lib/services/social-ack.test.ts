import { describe, it, expect } from "vitest";
import { matchSocialAck } from "@/lib/services/social-ack";

describe("matchSocialAck", () => {
  it("acknowledges praise / worship", () => {
    expect(matchSocialAck("praise God, what a service today")).toMatch(/glory/i);
    expect(matchSocialAck("Hallelujah!")).toMatch(/glory|amen/i);
    expect(matchSocialAck("God is good")).toBeTruthy();
  });

  it("acknowledges thanks", () => {
    expect(matchSocialAck("thank you so much")).toMatch(/welcome/i);
    expect(matchSocialAck("thanks")).toMatch(/welcome/i);
  });

  it("acknowledges a blessing, kept distinct from thanks", () => {
    expect(matchSocialAck("God bless you")).toMatch(/bless you/i);
    expect(matchSocialAck("stay blessed")).toMatch(/bless you/i);
  });

  it("acknowledges a bare amen", () => {
    expect(matchSocialAck("amen")).toBe("Amen! 🙏");
    expect(matchSocialAck("amin")).toBe("Amen! 🙏");
  });

  it("acknowledges a farewell", () => {
    expect(matchSocialAck("good night")).toMatch(/blessed/i);
    expect(matchSocialAck("bye")).toMatch(/blessed/i);
  });

  it("returns null for a task, a question, or empty text (so the caller shows the menu)", () => {
    expect(matchSocialAck("log ₦15k expense")).toBeNull();
    expect(matchSocialAck("how many members do we have")).toBeNull();
    expect(matchSocialAck("the generator situation at the back gate")).toBeNull();
    expect(matchSocialAck("")).toBeNull();
  });
});
