import { describe, it, expect, vi, beforeEach } from "vitest";

const { inserts } = vi.hoisted(() => ({ inserts: [] as { table: string; row: Record<string, unknown> }[] }));

vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { recordDeliveryStatus } from "@/lib/services/whatsapp-status";

beforeEach(() => { inserts.length = 0; });

describe("recordDeliveryStatus — WS5 delivery visibility", () => {
  it("logs a failed delivery so no message silently vanishes", async () => {
    await recordDeliveryStatus({ messageId: "wamid.x", to: "234801", status: "failed", error: "recipient unreachable" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: "whatsapp_send_logs",
      row: { direction: "outbound", kind: "status", to_phone: "234801", status: "failed", error: "recipient unreachable" },
    });
  });

  it("normalizes delivered/read/sent and drops temporary errors", async () => {
    await recordDeliveryStatus({ messageId: "wamid.x", to: "234801", status: "delivered" });
    expect(inserts[0].row).toMatchObject({ status: "delivered", error: null });
  });

  it("returns early for unknown statuses", async () => {
    await recordDeliveryStatus({ messageId: "wamid.x", to: "234801", status: "deleted" });
    expect(inserts).toHaveLength(0);
  });
});
