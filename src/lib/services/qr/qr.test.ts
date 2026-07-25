import { describe, it, expect, afterEach } from "vitest";
import { cherttNumber, buildWaLink, resolvePoster, PRESET_LIST } from "@/lib/services/qr/qr";

describe("cherttNumber", () => {
  const original = process.env.WHATSAPP_DISPLAY_NUMBER;
  afterEach(() => {
    if (original === undefined) delete process.env.WHATSAPP_DISPLAY_NUMBER;
    else process.env.WHATSAPP_DISPLAY_NUMBER = original;
  });

  it("falls back to the demo number when unset", () => {
    delete process.env.WHATSAPP_DISPLAY_NUMBER;
    expect(cherttNumber()).toBe("2349117747777");
  });

  it("reads the env var and strips non-digits", () => {
    process.env.WHATSAPP_DISPLAY_NUMBER = "+234 802 000 1111";
    expect(cherttNumber()).toBe("2348020001111");
  });
});

describe("buildWaLink", () => {
  it("builds a wa.me link with the number and URL-encoded text", () => {
    expect(buildWaLink("Hi", "2348000000000")).toBe("https://wa.me/2348000000000?text=Hi");
  });

  it("encodes spaces, hashes and unicode", () => {
    const link = buildWaLink("Pickup code #482913 🙏", "2348000000000");
    expect(link).toContain("Pickup%20code%20%23482913");
    expect(link).not.toContain(" ");
    expect(link).not.toContain("#");
  });
});

describe("resolvePoster", () => {
  it("custom text wins over any preset", () => {
    const p = resolvePoster({ preset: "join", text: "Register my car", title: "Parking" });
    expect(p.waText).toBe("Register my car");
    expect(p.title).toBe("Parking");
  });

  it("maps the join preset by default and for unknown presets", () => {
    expect(resolvePoster({}).waText).toBe("Hi");
    expect(resolvePoster({ preset: "nonsense" }).waText).toBe("Hi");
  });

  it("maps each named preset to its message", () => {
    expect(resolvePoster({ preset: "kids" }).waText).toBe("Check in my child");
    expect(resolvePoster({ preset: "parking" }).waText).toBe("I need parking help");
    expect(resolvePoster({ preset: "give" }).waText).toBe("I want to give");
    expect(resolvePoster({ preset: "prayer" }).waText).toBe("I'd like prayer");
    expect(resolvePoster({ preset: "events" }).waText).toBe("What events are coming up?");
  });

  it("embeds a sanitized pickup code, and degrades gracefully without one", () => {
    expect(resolvePoster({ preset: "pickup", code: "48-29-13x" }).waText).toBe("Pickup code 482913");
    expect(resolvePoster({ preset: "pickup" }).waText).toBe("Pickup code");
    expect(resolvePoster({ preset: "pickup" }).subtitle).toMatch(/code=/);
  });

  it("lets copy be overridden on a preset", () => {
    const p = resolvePoster({ preset: "give", title: "Building Fund" });
    expect(p.waText).toBe("I want to give");
    expect(p.title).toBe("Building Fund");
  });
});

describe("PRESET_LIST", () => {
  it("covers every gallery preset with title + blurb", () => {
    expect(PRESET_LIST.length).toBe(7);
    for (const p of PRESET_LIST) {
      expect(p.id).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.blurb).toBeTruthy();
    }
  });
});
