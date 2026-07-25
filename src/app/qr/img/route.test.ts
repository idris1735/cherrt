import { describe, it, expect } from "vitest";
import { GET } from "@/app/qr/img/route";

describe("GET /qr/img", () => {
  it("returns a PNG image for a preset", async () => {
    const res = await GET(new Request("https://x.test/qr/img?preset=pickup&code=482913"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // PNG magic number
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("works for a custom text with no preset", async () => {
    const res = await GET(new Request("https://x.test/qr/img?text=Hello"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});
