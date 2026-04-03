import { parseCommandRequestPayload } from "@/lib/services/command-engine/request-validator";

describe("parseCommandRequestPayload", () => {
  it("accepts valid payload and normalizes prompt/modules", () => {
    const parsed = parseCommandRequestPayload({
      prompt: "   Create a poll for weekly ops check-in   ",
      context: {
        role: "admin",
        enabledModules: ["toolkit", "toolkit", "events"],
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.data.prompt).toBe("Create a poll for weekly ops check-in");
    expect(parsed.data.context?.role).toBe("admin");
    expect(parsed.data.context?.enabledModules).toEqual(["toolkit", "events"]);
  });

  it("rejects unknown roles", () => {
    const parsed = parseCommandRequestPayload({
      prompt: "Create request",
      context: {
        role: "guest",
      },
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe("Invalid command context.");
  });

  it("rejects blank prompts", () => {
    const parsed = parseCommandRequestPayload({
      prompt: "   ",
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe("Prompt is required.");
  });
});
