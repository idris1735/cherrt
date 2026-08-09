import { describe, it, expect, vi, beforeEach } from "vitest";

const { uploadMock, signMock } = vi.hoisted(() => ({
  uploadMock: vi.fn().mockResolvedValue({ error: null }),
  signMock: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed/x" }, error: null }),
}));
vi.mock("@/lib/services/supabase-server", () => ({
  getSupabaseServerClient: () => ({ storage: { from: () => ({ upload: uploadMock, createSignedUrl: signMock }) } }),
}));

import { uploadKycFile, signedKycUrl } from "@/lib/services/kyc/storage";

beforeEach(() => { uploadMock.mockClear(); signMock.mockClear(); });

describe("kyc storage", () => {
  it("uploads bytes to the kyc bucket", async () => {
    const ok = await uploadKycFile("app1/selfie.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(ok).toBe(true);
    expect(uploadMock).toHaveBeenCalledWith("app1/selfie.jpg", expect.anything(), expect.objectContaining({ contentType: "image/jpeg" }));
  });
  it("returns a signed URL", async () => {
    expect(await signedKycUrl("app1/selfie.jpg")).toBe("https://signed/x");
  });
});
