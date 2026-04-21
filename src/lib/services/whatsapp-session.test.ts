import { describe, it, expect, beforeEach } from "vitest";
import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
  resetSessions,
} from "@/lib/services/whatsapp-session";

describe("whatsapp session store", () => {
  beforeEach(() => {
    resetSessions();
  });

  it("creates a new session for an unknown phone number", async () => {
    const session = await getSession("2348012345678");
    expect(session.phoneNumber).toBe("2348012345678");
    expect(session.history).toEqual([]);
    expect(session.pendingConfirmation).toBeUndefined();
  });

  it("returns the same session on repeated calls", async () => {
    await getSession("2348012345678");
    updateSession("2348012345678", { pendingConfirmation: { originalPrompt: "test", artifactKind: "document", previewTitle: "Test Doc" } });
    const session = await getSession("2348012345678");
    expect(session.pendingConfirmation?.previewTitle).toBe("Test Doc");
  });

  it("adds messages to history and caps at 20 entries", async () => {
    for (let i = 0; i < 12; i++) {
      addToHistory("2348012345678", "user", `message ${i}`);
      addToHistory("2348012345678", "assistant", `reply ${i}`);
    }
    const session = await getSession("2348012345678");
    expect(session.history.length).toBe(20);
    expect(session.history[0].text).toBe("message 2");
  });

  it("clearPending removes confirmation and approval state", async () => {
    updateSession("2348012345678", {
      pendingConfirmation: { originalPrompt: "draft letter", artifactKind: "document", previewTitle: "Letter" },
      pendingApproval: { requestId: "req-1", requestTitle: "Fuel request" },
    });
    clearPending("2348012345678");
    const session = await getSession("2348012345678");
    expect(session.pendingConfirmation).toBeUndefined();
    expect(session.pendingApproval).toBeUndefined();
  });
});
