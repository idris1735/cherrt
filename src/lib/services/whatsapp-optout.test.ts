import { describe, it, expect, vi, beforeEach } from "vitest";

// Slice B acceptance: after STOP, the number receives NOTHING until it re-engages.
// The suppression guard sits in postToGraph — the single choke point for every
// outbound WhatsApp send (text, template, interactive, image).

vi.mock("@/lib/services/privacy/consent", () => ({
  isOptedOut: vi.fn().mockResolvedValue(false),
}));

import { sendTextMessage } from "@/lib/services/whatsapp";
import { isOptedOut } from "@/lib/services/privacy/consent";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  (isOptedOut as ReturnType<typeof vi.fn>).mockReset();
  (isOptedOut as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
  process.env.WHATSAPP_ACCESS_TOKEN = "tok";
});

describe("opted-out suppression (Slice B)", () => {
  it("does NOT send to an opted-out number", async () => {
    (isOptedOut as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    await sendTextMessage("2348001111111", "hello");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends normally when the number is not opted out", async () => {
    await sendTextMessage("2348001111111", "hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/messages");
  });

  it("sends when the opt-out lookup is unavailable (fail-open)", async () => {
    (isOptedOut as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    await sendTextMessage("2348001111111", "hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
