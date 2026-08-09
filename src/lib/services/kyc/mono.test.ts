import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { monoCacLookup, monoNinLookup, monoCacTrustees } from "@/lib/services/kyc/mono";

const origKey = process.env.MONO_SECRET_KEY;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.MONO_SECRET_KEY = "test_sk_abc";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); process.env.MONO_SECRET_KEY = origKey; });

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve("") } as Response);

describe("monoCacLookup", () => {
  it("GETs /v3/lookup/cac?search= with the sec key and maps companies", async () => {
    fetchMock.mockReturnValue(ok({ data: [{ id: "c1", approved_name: "GRACE CHAPEL", rc_number: "IT123", classification: "IT", active: true }] }));
    const res = await monoCacLookup("Grace Chapel");
    expect(res).toEqual({ ok: true, data: [{ id: "c1", approvedName: "GRACE CHAPEL", rcNumber: "IT123", classification: "IT", active: true }] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.withmono.com/v3/lookup/cac?search=Grace%20Chapel");
    expect((init.headers as Record<string, string>)["mono-sec-key"]).toBe("test_sk_abc");
  });

  it("returns an error result on a non-200", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve("unauthorized") } as Response);
    expect(await monoCacLookup("x")).toMatchObject({ ok: false });
  });
});

describe("monoNinLookup", () => {
  it("POSTs /v3/lookup/nin with the nin and maps the person + photo", async () => {
    fetchMock.mockReturnValue(ok({ data: { firstname: "Ada", surname: "Obi", birthdate: "01-01-1990", telephoneno: "234800", photo: "BASE64" } }));
    const res = await monoNinLookup("12345678901");
    expect(res).toEqual({ ok: true, data: { firstname: "Ada", surname: "Obi", middlename: undefined, birthdate: "01-01-1990", phone: "234800", photoBase64: "BASE64" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.withmono.com/v3/lookup/nin");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ nin: "12345678901" });
  });
});

describe("monoCacTrustees", () => {
  it("GETs the directors endpoint and maps names", async () => {
    fetchMock.mockReturnValue(ok({ data: [{ surname: "Obi", firstname: "Ada" }] }));
    expect(await monoCacTrustees("c1")).toEqual({ ok: true, data: [{ surname: "Obi", firstname: "Ada" }] });
    expect((fetchMock.mock.calls[0][0] as string)).toBe("https://api.withmono.com/v3/lookup/cac/company/c1/directors");
  });
});
