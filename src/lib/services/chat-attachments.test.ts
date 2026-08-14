import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Supabase + storage covering upload, createSignedUrl and chained queries.
const { store } = vi.hoisted(() => ({
  store: {
    inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
    uploads: [] as Array<{ path: string; bytes: Uint8Array; contentType?: string }>,
    uploadError: null as { message: string } | null,
    single: {} as Record<string, unknown | null>,
    list: {} as Record<string, unknown[]>,
  },
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: {
      from: () => ({
        upload: (path: string, bytes: Uint8Array, opts?: { contentType?: string }) => {
          store.uploads.push({ path, bytes, contentType: opts?.contentType });
          return Promise.resolve({ error: store.uploadError });
        },
        createSignedUrl: (path: string) => Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null }),
      }),
    },
    from(table: string) {
      const chain: Record<string, unknown> = {
        insert: (row: Record<string, unknown>) => {
          store.inserts.push({ table, row });
          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
        },
        update: (row: Record<string, unknown>) => {
          store.updates.push({ table, row });
          return chain;
        },
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: store.single[table] ?? null, error: null }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: store.list[table] ?? [], error: null }),
      };
      return chain;
    },
  }),
}));

import {
  persistChatAttachment,
  latestUnconfirmedAttachment,
  confirmAttachment,
  listPersonAttachments,
  signedAttachmentUrl,
} from "@/lib/services/chat-attachments";

beforeEach(() => {
  store.inserts.length = 0;
  store.updates.length = 0;
  store.uploads.length = 0;
  store.uploadError = null;
  store.single = {};
  store.list = {};
});

describe("persistChatAttachment", () => {
  it("uploads to the private bucket and inserts a row", async () => {
    const out = await persistChatAttachment({
      workspaceId: "ws1",
      personId: "p1",
      kind: "image",
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/jpeg",
      caption: "receipt",
    });
    expect(out).not.toBeNull();
    expect(store.uploads[0].path).toMatch(/^ws1\/p1\/.+\.jpg$/);
    expect(store.uploads[0].bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(store.inserts[0]).toMatchObject({
      table: "chat_attachments",
      row: expect.objectContaining({
        workspace_id: "ws1",
        person_id: "p1",
        kind: "image",
        mime_type: "image/jpeg",
        caption: "receipt",
        source: "whatsapp",
      }),
    });
  });

  it("stores unlinked senders under unlinked/ with null ids", async () => {
    const out = await persistChatAttachment({ workspaceId: null, personId: null, kind: "document", buffer: Buffer.from([]), mimeType: "application/pdf" });
    expect(out).not.toBeNull();
    expect(store.uploads[0].path).toMatch(/^unlinked\/.+\.pdf$/);
    expect(store.inserts[0].row).toMatchObject({ workspace_id: null, person_id: null });
  });

  it("returns null (never throws) when the upload fails", async () => {
    store.uploadError = { message: "bucket full" };
    const out = await persistChatAttachment({ workspaceId: "ws1", personId: "p1", kind: "image", buffer: Buffer.from([]), mimeType: "image/png" });
    expect(out).toBeNull();
    expect(store.inserts.length).toBe(0);
  });
});

describe("latestUnconfirmedAttachment / confirmAttachment", () => {
  it("finds only the newest unconfirmed row and confirms it", async () => {
    const older = { id: "a1", kind: "image", mime_type: "image/jpeg", caption: null, confirmed_at: null, created_at: "2026-08-14T09:00:00Z", storage_path: "ws1/p1/a1.jpg" };
    const newer = { id: "a2", kind: "image", mime_type: "image/png", caption: null, confirmed_at: null, created_at: "2026-08-14T09:05:00Z", storage_path: "ws1/p1/a2.png" };
    store.list["chat_attachments"] = [older, newer];
    store.single["chat_attachments"] = newer;
    const latest = await latestUnconfirmedAttachment("p1");
    expect(latest?.id).toBe("a2");
    expect(await confirmAttachment("a2", "my receipt")).toBe(true);
    expect(store.updates[0]).toMatchObject({ table: "chat_attachments", row: expect.objectContaining({ caption: "my receipt" }) });
  });
});

describe("listPersonAttachments / signedAttachmentUrl", () => {
  it("lists rows and signs urls from the private bucket", async () => {
    store.list["chat_attachments"] = [
      { id: "a1", kind: "image", mime_type: "image/jpeg", caption: "pic", confirmed_at: "2026-08-14T09:00:00Z", created_at: "2026-08-14T09:00:00Z", storage_path: "ws1/p1/a1.jpg" },
    ];
    const rows = await listPersonAttachments("p1");
    expect(rows).toHaveLength(1);
    expect(rows[0].caption).toBe("pic");
    expect(await signedAttachmentUrl("ws1/p1/a1.jpg")).toContain("ws1/p1/a1.jpg");
  });
});
