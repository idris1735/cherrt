import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Supabase supporting insert, chained select→maybeSingle, and update.
const { store, resolvePhoneMock } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
    deletes: [] as Array<{ table: string }>,
    single: {} as Record<string, unknown | null>,
    list: {} as Record<string, unknown[]>,
  },
  resolvePhoneMock: vi.fn(),
}));
vi.mock("@/lib/services/identity/provisioning", () => ({ resolvePersonIdByPhone: resolvePhoneMock }));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          store.inserts.push({ table, row });
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "new-person", ...row }, error: null }) }) };
        },
        update: (row: Record<string, unknown>) => {
          store.updates.push({ table, row });
          return chain;
        },
        delete: () => {
          store.deletes.push({ table });
          return chain;
        },
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.list[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendImageMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/privacy/consent", () => ({
  recordConsent: vi.fn().mockResolvedValue(undefined),
}));

import { CHILD_TOOLS } from "@/lib/services/agent/child-tools";
import { sendImageMessage } from "@/lib/services/whatsapp";
import { recordConsent } from "@/lib/services/privacy/consent";
import type { AgentContext } from "@/lib/services/agent/tools";

const mockImage = sendImageMessage as ReturnType<typeof vi.fn>;
const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const tool = (name: string) => CHILD_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.updates.length = 0;
  store.deletes.length = 0;
  store.single = {};
  store.list = {};
  mockImage.mockClear();
  resolvePhoneMock.mockReset();
});

describe("check_in_child", () => {
  it("inserts a checked-in child and returns a pickup code", async () => {
    const out = (await tool("check_in_child").handler({ childName: "Timmy", age: 5, allergies: "peanuts" }, ctx)) as {
      ok: boolean;
      pickupCode: string;
      message: string;
    };
    expect(out.ok).toBe(true);
    expect(out.pickupCode).toMatch(/^\d{6}$/);
    expect(store.inserts[0]).toMatchObject({
      table: "child_checkins",
      row: { workspace_id: "ws1", child_name: "Timmy", age: 5, allergies: "peanuts", guardian_name: "Ruth", status: "checked_in" },
    });
    expect(out.message).toContain(out.pickupCode);
  });

  it("rejects a missing child name", async () => {
    const out = (await tool("check_in_child").handler({ childName: "" }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.inserts).toHaveLength(0);
  });

  it("sends the pickup pass as a QR image when the sender's phone is known", async () => {
    const out = (await tool("check_in_child").handler({ childName: "Amara" }, { ...ctx, phone: "2348012345678" })) as { pickupCode: string };
    expect(mockImage).toHaveBeenCalledTimes(1);
    const [to, url, caption] = mockImage.mock.calls[0] as [string, string, string];
    expect(to).toBe("2348012345678");
    expect(url).toContain(`/qr/img?preset=pickup&code=${out.pickupCode}`);
    expect(caption).toContain("Amara");
  });

  it("still checks in even if the QR image fails to send", async () => {
    mockImage.mockRejectedValueOnce(new Error("whatsapp down"));
    const out = (await tool("check_in_child").handler({ childName: "Zoe" }, { ...ctx, phone: "2348012345678" })) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.inserts[0]).toMatchObject({ table: "child_checkins", row: { child_name: "Zoe" } });
  });

  it("does not attempt an image send without a known phone", async () => {
    await tool("check_in_child").handler({ childName: "Timmy" }, ctx);
    expect(mockImage).not.toHaveBeenCalled();
  });
});

describe("lookup_child_pickup", () => {
  it("returns the child + guardian for a valid code", async () => {
    store.single["child_checkins"] = { child_name: "Timmy", age: 5, allergies: "peanuts", guardian_name: "Ruth" };
    const out = (await tool("lookup_child_pickup").handler({ pickupCode: "4821" }, ctx)) as {
      found: boolean;
      child: { name: string; guardian: string };
    };
    expect(out.found).toBe(true);
    expect(out.child).toMatchObject({ name: "Timmy", guardian: "Ruth" });
  });

  it("reports not-found for an unknown code", async () => {
    store.single["child_checkins"] = null;
    const out = (await tool("lookup_child_pickup").handler({ pickupCode: "0000" }, ctx)) as { found: boolean };
    expect(out.found).toBe(false);
  });
});

describe("release_child — WS-D guardian-bound release", () => {
  it("is confirmation-gated with a code-specific preview", () => {
    const t = tool("release_child");
    expect(t.requiresConfirmation).toBe(true);
    expect(t.preview?.({ pickupCode: "4821" })).toContain("4821");
  });

  it("releases ONLY to the child's registered guardian with pickup permission", async () => {
    store.single["child_checkins"] = { id: "c1", child_name: "Timmy", child_person_id: "k1", guardian_person_id: null };
    store.single["guardianships"] = { id: "gs1" }; // requester is a can_pickup guardian of k1
    const out = (await tool("release_child").handler({ pickupCode: "4821", pickedUpBy: "Ruth" }, { ...ctx, personId: "g1" })) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.updates[0]).toMatchObject({ table: "child_checkins", row: { status: "picked_up", picked_up_by: "Ruth", child_person_id: "k1", guardian_person_id: "g1" } });
  });

  it("REFUSES a non-guardian even with the CORRECT pickup code", async () => {
    store.single["child_checkins"] = { id: "c1", child_name: "Timmy", child_person_id: "k1", guardian_person_id: null };
    store.single["guardianships"] = null; // requester is not a guardian of k1
    resolvePhoneMock.mockResolvedValue("g8");
    const out = (await tool("release_child").handler({ pickupCode: "4821" }, { ...ctx, phone: "234999" })) as { error?: string };
    expect(out.error).toContain("registered guardian");
    expect(store.updates).toHaveLength(0);
  });

  it("matches the child by name inside the requester's guardianships when the check-in isn't linked", async () => {
    store.single["child_checkins"] = { id: "c1", child_name: "Timmy", child_person_id: null, guardian_person_id: null };
    store.list["guardianships"] = [{ child_person_id: "k1" }];
    store.list["people"] = [{ id: "k1", full_name: "Timmy" }];
    store.single["guardianships"] = { id: "gs1" };
    const out = (await tool("release_child").handler({ pickupCode: "4821" }, { ...ctx, personId: "g1" })) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(store.updates[0].row).toMatchObject({ status: "picked_up", child_person_id: "k1" });
  });

  it("refuses when no checked-in child matches the code", async () => {
    store.single["child_checkins"] = null;
    const out = (await tool("release_child").handler({ pickupCode: "0000" }, { ...ctx, personId: "g1" })) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(store.updates).toHaveLength(0);
  });
});

describe("pickup-code throttling — WS-D", () => {
  it("locks lookup after 5 wrong attempts inside 10 minutes", async () => {
    store.single["pickup_attempts"] = { id: "pa1", wrong_count: 5, window_started_at: new Date().toISOString(), locked_until: null };
    const out = (await tool("lookup_child_pickup").handler({ pickupCode: "4821" }, { ...ctx, phone: "234999" })) as { error?: string };
    expect(out.error).toContain("Too many wrong pickup attempts");
  });

  it("records a wrong attempt when the code doesn't resolve", async () => {
    store.single["child_checkins"] = null;
    store.single["pickup_attempts"] = null;
    const out = (await tool("lookup_child_pickup").handler({ pickupCode: "0000" }, { ...ctx, phone: "234999" })) as { found: boolean };
    expect(out.found).toBe(false);
    expect(store.inserts.some((i) => i.table === "pickup_attempts" && i.row.wrong_count === 1)).toBe(true);
  });

  it("locks release the same way", async () => {
    store.single["pickup_attempts"] = { id: "pa1", wrong_count: 5, window_started_at: new Date().toISOString(), locked_until: null };
    const out = (await tool("release_child").handler({ pickupCode: "4821" }, { ...ctx, phone: "234999" })) as { error?: string };
    expect(out.error).toContain("Too many wrong pickup attempts");
    // no child was released — only the lock itself was written
    expect(store.updates.some((u) => u.table === "child_checkins")).toBe(false);
    expect(store.updates.some((u) => u.table === "pickup_attempts" && u.row.locked_until)).toBe(true);
  });
});

describe("check_in_child — WS-D identity linking", () => {
  it("links the check-in to the registered guardian and child person", async () => {
    store.list["guardianships"] = [{ child_person_id: "k1" }];
    store.list["people"] = [{ id: "k1", full_name: "Timmy" }];
    await tool("check_in_child").handler({ childName: "Timmy" }, { ...ctx, personId: "g1" });
    expect(store.inserts[0]).toMatchObject({ table: "child_checkins", row: { child_person_id: "k1", guardian_person_id: "g1" } });
  });
});

describe("list_checked_in_children", () => {
  it("counts and lists the currently checked-in children", async () => {
    store.list["child_checkins"] = [
      { child_name: "Zoe", age: 5, guardian_name: "Faith", allergies: "peanuts" },
      { child_name: "Caleb", age: 8, guardian_name: "Blessing", allergies: null },
    ];
    const out = (await tool("list_checked_in_children").handler({}, ctx)) as {
      count: number;
      children: Array<{ name: string; guardian: string }>;
    };
    expect(out.count).toBe(2);
    expect(out.children[0]).toMatchObject({ name: "Zoe", guardian: "Faith" });
  });

  it("returns zero when none are checked in", async () => {
    store.list["child_checkins"] = [];
    const out = (await tool("list_checked_in_children").handler({}, ctx)) as { count: number };
    expect(out.count).toBe(0);
  });

  it("is gated to the children's team / leaders", () => {
    expect(tool("list_checked_in_children").minRank).toBe(1);
  });
});

describe("register_child — guardian consent (Slice D)", () => {
  const guardianCtx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth", personId: "guardian1" };

  it("REFUSES to create a child without guardianConsent", async () => {
    const out = (await tool("register_child").handler({ childName: "Amara" }, guardianCtx)) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(out.error).toContain("parent or guardian");
    // nothing stored — no child_profiles, no guardianships
    expect(store.inserts.some((i) => i.table === "child_profiles")).toBe(false);
    expect(store.inserts.some((i) => i.table === "guardianships")).toBe(false);
  });

  it("records guardian-given consent on the child person when consented", async () => {
    const out = (await tool("register_child").handler({ childName: "Amara", guardianConsent: true }, guardianCtx)) as { ok: boolean };
    expect(out.ok).toBe(true);
    expect(recordConsent).toHaveBeenCalledWith({
      personId: expect.any(String),
      source: "guardian",
      guardianPersonId: "guardian1",
    });
    expect(store.inserts.some((i) => i.table === "guardianships")).toBe(true);
  });

  it("WS2 — stores the full child field set including who may collect", async () => {
    await tool("register_child").handler({
      childName: "Amara", guardianConsent: true,
      birthdate: "2020-04-12", allergies: "peanuts", medicalNotes: "inhaler",
      classroom: "Primary 1", whoMayCollect: "Only Ada Obi and Sam Eze",
    }, guardianCtx);
    const profile = store.inserts.find((i) => i.table === "child_profiles");
    expect(profile?.row).toMatchObject({
      allergies: "peanuts", medical_notes: "inhaler", classroom: "Primary 1", who_may_collect: "Only Ada Obi and Sam Eze",
    });
    const personPatch = store.updates.find((u) => u.table === "people");
    expect(personPatch?.row).toMatchObject({ birthdate: "2020-04-12" });
  });
});
