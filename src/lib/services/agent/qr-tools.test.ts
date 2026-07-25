import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/whatsapp", () => ({
  sendImageMessage: vi.fn().mockResolvedValue(undefined),
}));

import { QR_TOOLS } from "@/lib/services/agent/qr-tools";
import { sendImageMessage } from "@/lib/services/whatsapp";
import type { AgentContext } from "@/lib/services/agent/tools";

const mockImage = sendImageMessage as ReturnType<typeof vi.fn>;
const sendQr = QR_TOOLS.find((t) => t.name === "send_qr")!;
const ctx: AgentContext = { workspaceId: "ws1", role: "senior_pastor", userName: "Idris", phone: "2348012345678" };

beforeEach(() => mockImage.mockClear());

describe("send_qr", () => {
  it("sends the requested QR image into the chat", async () => {
    const out = (await sendQr.handler({ kind: "parking" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(mockImage).toHaveBeenCalledTimes(1);
    const [to, url] = mockImage.mock.calls[0] as [string, string];
    expect(to).toBe("2348012345678");
    expect(url).toContain("/qr/img?preset=parking");
  });

  it("defaults to the join QR", async () => {
    await sendQr.handler({}, ctx);
    const [, url] = mockImage.mock.calls[0] as [string, string];
    expect(url).toContain("/qr/img?preset=join");
  });

  it("errors without a phone to send to", async () => {
    const out = (await sendQr.handler({ kind: "join" }, { ...ctx, phone: undefined })) as { error?: string };
    expect(out.error).toBeTruthy();
    expect(mockImage).not.toHaveBeenCalled();
  });

  it("degrades gracefully if the send fails", async () => {
    mockImage.mockRejectedValueOnce(new Error("whatsapp down"));
    const out = (await sendQr.handler({ kind: "give" }, ctx)) as { error?: string };
    expect(out.error).toBeTruthy();
  });
});
