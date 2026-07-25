import { describe, it, expect, afterEach } from "vitest";
import { demoModeEnabled } from "@/lib/services/demo/demo-mode";

describe("demoModeEnabled", () => {
  const original = process.env.CHERTT_DEMO_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.CHERTT_DEMO_MODE;
    else process.env.CHERTT_DEMO_MODE = original;
  });

  it("is on by default when the env var is unset", () => {
    delete process.env.CHERTT_DEMO_MODE;
    expect(demoModeEnabled()).toBe(true);
  });

  it("is off only when explicitly set to 'off'", () => {
    process.env.CHERTT_DEMO_MODE = "off";
    expect(demoModeEnabled()).toBe(false);
  });

  it("stays on for any other value", () => {
    process.env.CHERTT_DEMO_MODE = "on";
    expect(demoModeEnabled()).toBe(true);
  });
});
