import { describe, it, expect, beforeEach, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    latestUnconfirmedAttachment: vi.fn(),
    confirmAttachment: vi.fn(),
    listPersonAttachments: vi.fn(),
    signedAttachmentUrl: vi.fn(),
  },
}));
vi.mock("@/lib/services/chat-attachments", () => ({
  latestUnconfirmedAttachment: mocks.latestUnconfirmedAttachment,
  confirmAttachment: mocks.confirmAttachment,
  listPersonAttachments: mocks.listPersonAttachments,
  signedAttachmentUrl: mocks.signedAttachmentUrl,
}));

import { ATTACHMENT_TOOLS } from "@/lib/services/agent/attachment-tools";
import type { AgentContext } from "@/lib/services/agent/tools";

const tool = (name: string) => ATTACHMENT_TOOLS.find((t) => t.name === name)!;
const ctx: AgentContext = { workspaceId: "ws1", role: "member", userName: "Ada", personId: "p1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirmAttachment.mockResolvedValue(true);
  mocks.listPersonAttachments.mockResolvedValue([]);
  mocks.signedAttachmentUrl.mockResolvedValue(null);
});

describe("save_attachment — never a phantom save", () => {
  it("confirms a REAL recent attachment and tells the sender it's saved", async () => {
    mocks.latestUnconfirmedAttachment.mockResolvedValue({
      id: "a1", kind: "image", mimeType: "image/jpeg", caption: null, confirmedAt: null,
      createdAt: "2026-08-14T09:00:00Z", storagePath: "ws1/p1/a1.jpg",
    });
    const out = (await tool("save_attachment").handler({ caption: "my CAC card" }, ctx)) as { ok: boolean; message: string };
    expect(out.ok).toBe(true);
    expect(out.message).toContain("my CAC card");
    expect(mocks.confirmAttachment).toHaveBeenCalledWith("a1", "my CAC card");
  });

  it("REFUSES to claim a save when nothing recent is on file", async () => {
    mocks.latestUnconfirmedAttachment.mockResolvedValue(null);
    const out = (await tool("save_attachment").handler({}, ctx)) as { error?: string };
    expect(out.error).toContain("send the photo");
    expect(mocks.confirmAttachment).not.toHaveBeenCalled();
  });

  it("refuses when the sender has no person record", async () => {
    const out = (await tool("save_attachment").handler({}, { ...ctx, personId: undefined })) as { error?: string };
    expect(out.error).toContain("member record");
  });
});

describe("list_attachments — leaders only, data-sensitive", () => {
  it("is gated for leaders and flagged data-sensitive", () => {
    const t = tool("list_attachments");
    expect(t.minRank).toBe(1);
    expect(t.dataSensitive).toBe(true);
  });

  it("lists a person's files with signed urls", async () => {
    mocks.listPersonAttachments.mockResolvedValue([
      { id: "a1", kind: "image", mimeType: "image/jpeg", caption: "pic", confirmedAt: "x", createdAt: "y", storagePath: "ws1/p1/a1.jpg" },
    ]);
    mocks.signedAttachmentUrl.mockResolvedValue("https://signed/a1.jpg");
    const out = (await tool("list_attachments").handler({ personId: "p1" }, ctx)) as { files: Array<{ url: string | null }>; message: string };
    expect(out.files).toHaveLength(1);
    expect(out.files[0].url).toBe("https://signed/a1.jpg");
  });
});
