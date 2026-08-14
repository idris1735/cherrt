import { describe, it, expect, beforeEach, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { setAttribute: vi.fn(), getAttributes: vi.fn() },
}));
vi.mock("@/lib/services/identity/attributes", () => ({
  setAttribute: mocks.setAttribute,
  getAttributes: mocks.getAttributes,
}));

import { ATTRIBUTE_TOOLS } from "@/lib/services/agent/attribute-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const tool = (name: string) => ATTRIBUTE_TOOLS.find((t) => t.name === name)!;
const member: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ada", personId: "p1" };
const leader: AgentContext = { workspaceId: "ws1", role: "secretary", userName: "Bola", personId: "p9" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setAttribute.mockResolvedValue({ ok: true, category: "normal" });
  mocks.getAttributes.mockResolvedValue([]);
});

describe("set_person_attribute", () => {
  it("is confirmation-gated (special writes are never silent)", () => {
    expect(tool("set_person_attribute").requiresConfirmation).toBe(true);
  });

  it("saves a normal fact for the current member", async () => {
    const out = (await tool("set_person_attribute").handler({ key: "prefers yoruba", value: "8am" }, member)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(mocks.setAttribute).toHaveBeenCalledWith(
      expect.objectContaining({ personId: "p1", key: "prefers yoruba", consentedSpecial: false }),
    );
  });

  it("passes the explicit special-consent flag through", async () => {
    await tool("set_person_attribute").handler({ key: "health", value: "diabetic", consentedSpecial: true }, member);
    expect(mocks.setAttribute).toHaveBeenCalledWith(expect.objectContaining({ consentedSpecial: true }));
  });

  it("surfaces the refusal when the service rejects a special fact", async () => {
    mocks.setAttribute.mockResolvedValue({ ok: false, reason: "That's sensitive personal data — I need the person's explicit consent before storing it." });
    const out = (await tool("set_person_attribute").handler({ key: "health", value: "diabetic" }, member)) as { error?: string };
    expect(out.error).toContain("consent");
  });

  it("only lets leaders write notes on someone else's record", async () => {
    const denied = (await tool("set_person_attribute").handler({ key: "k", value: "v", personId: "p2" }, member)) as { error?: string };
    expect(denied.error).toContain("leader");
    expect(mocks.setAttribute).not.toHaveBeenCalled();
    const allowed = (await tool("set_person_attribute").handler({ key: "k", value: "v", personId: "p2" }, leader)) as { ok: boolean };
    expect(allowed.ok).toBe(true);
  });
});

describe("get_person_attributes", () => {
  it("is data-sensitive and leaders-only for other people", () => {
    expect(tool("get_person_attributes").dataSensitive).toBe(true);
  });

  it("reads the current member's own notes", async () => {
    mocks.getAttributes.mockResolvedValue([{ key: "prefers_yoruba_service", value: "8am", category: "normal", source: "whatsapp", createdAt: "x", updatedAt: "x" }]);
    const out = (await tool("get_person_attributes").handler({}, member)) as { attributes: unknown[] };
    expect(out.attributes).toHaveLength(1);
  });

  it("refuses a member who asks for someone else's notes", async () => {
    const out = (await tool("get_person_attributes").handler({ personId: "p2" }, member)) as { error?: string };
    expect(out.error).toContain("leader");
  });
});
