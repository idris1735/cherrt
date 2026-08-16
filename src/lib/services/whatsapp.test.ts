import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendImageMessage, sendUrlButton } from "@/lib/services/whatsapp";

describe("sendImageMessage", () => {
  const origId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const origToken = process.env.WHATSAPP_ACCESS_TOKEN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "PN123";
    process.env.WHATSAPP_ACCESS_TOKEN = "TOKEN";
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.WHATSAPP_PHONE_NUMBER_ID = origId;
    process.env.WHATSAPP_ACCESS_TOKEN = origToken;
  });

  it("posts an image message with the link and caption", async () => {
    await sendImageMessage("2348012345678", "https://cherrt.vercel.app/qr/img?preset=pickup&code=482913", "pickup pass");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [urlArg, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(urlArg).toContain("/PN123/messages");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "2348012345678",
      type: "image",
      image: { link: "https://cherrt.vercel.app/qr/img?preset=pickup&code=482913", caption: "pickup pass" },
    });
  });

  it("omits the caption when none is given", async () => {
    await sendImageMessage("2348012345678", "https://x/img.png");
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.image).toEqual({ link: "https://x/img.png" });
  });
});

describe("sendUrlButton (P1-4)", () => {
  const origId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const origToken = process.env.WHATSAPP_ACCESS_TOKEN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "PN123";
    process.env.WHATSAPP_ACCESS_TOKEN = "TOKEN";
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.WHATSAPP_PHONE_NUMBER_ID = origId;
    process.env.WHATSAPP_ACCESS_TOKEN = origToken;
  });

  it("sends a tappable URL button, hiding the raw URL from the body", async () => {
    await sendUrlButton("2348012345678", "Tap below to verify", "https://cherrt.vercel.app/onboard/tok123", "Verify my church");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Tap below to verify" },
        action: { buttons: [{ type: "url", url: "https://cherrt.vercel.app/onboard/tok123", text: "Verify my church" }] },
      },
    });
  });
});
