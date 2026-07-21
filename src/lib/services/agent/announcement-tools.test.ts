import { describe, it, expect, beforeEach, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: { inserts: [] as Array<{ table: string; row: Record<string, unknown> }>, selectData: {} as Record<string, unknown[]> },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          store.inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.selectData[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/services/whatsapp", () => ({ sendTextMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/identity/provisioning", () => ({ listWorkspaceMemberPhones: vi.fn() }));

import { sendTextMessage } from "@/lib/services/whatsapp";
import { listWorkspaceMemberPhones } from "@/lib/services/identity/provisioning";
import { ANNOUNCEMENT_TOOLS } from "@/lib/services/agent/announcement-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const admin: AgentContext = { workspaceId: "ws1", role: "senior_pastor", userName: "Pastor" };
const member: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ruth" };
const tool = (name: string) => ANNOUNCEMENT_TOOLS.find((t) => t.name === name)!;

beforeEach(() => {
  store.inserts.length = 0;
  store.selectData = {};
  vi.clearAllMocks();
});

describe("create_announcement", () => {
  it("is confirmation-gated", () => {
    expect(tool("create_announcement").requiresConfirmation).toBe(true);
  });

  it("fans out to every member phone and records the count (admin)", async () => {
    vi.mocked(listWorkspaceMemberPhones).mockResolvedValueOnce(["2348010000001", "2348010000002", "2348010000003"]);
    const out = (await tool("create_announcement").handler({ title: "Sunday", message: "Service at 9am" }, admin)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(sendTextMessage).toHaveBeenCalledTimes(3);
    expect(out.message).toContain("3 members");
    expect(store.inserts[0]).toMatchObject({ table: "announcements", row: { workspace_id: "ws1", title: "Sunday", recipient_count: 3 } });
  });

  it("refuses a non-admin without sending anything", async () => {
    const out = (await tool("create_announcement").handler({ title: "Sunday", message: "hi" }, member)) as { error?: string };
    expect(out.error).toMatch(/admin/i);
    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(store.inserts).toHaveLength(0);
  });

  it("counts only successful sends", async () => {
    vi.mocked(listWorkspaceMemberPhones).mockResolvedValueOnce(["a", "b"]);
    vi.mocked(sendTextMessage).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("cold: template required"));
    const out = (await tool("create_announcement").handler({ title: "T", message: "M" }, admin)) as { message: string };
    expect(out.message).toContain("1 member");
    expect(store.inserts[0].row).toMatchObject({ recipient_count: 1 });
  });
});
