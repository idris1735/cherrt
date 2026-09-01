import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { monoCacLookup, monoNinLookup, monoBvnLookup, monoCacTrustees } from "@/lib/services/kyc/mono";

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

describe("monoBvnLookup", () => {
  it("POSTs /v3/lookup/bvn with the bvn and maps the person (snake_case tolerated)", async () => {
    fetchMock.mockReturnValue(ok({ data: { first_name: "Ada", last_name: "Obi", dob: "1990-01-01", phone_number: "234800" } }));
    const res = await monoBvnLookup("12345678901");
    expect(res).toEqual({ ok: true, data: { firstname: "Ada", surname: "Obi", middlename: undefined, birthdate: "1990-01-01", phone: "234800", photoBase64: undefined } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.withmono.com/v3/lookup/bvn");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ bvn: "12345678901" });
  });

  it("returns an error result on a non-200 (→ manual review upstream)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}), text: () => Promise.resolve("bvn requires otp") } as Response);
    expect(await monoBvnLookup("12345678901")).toMatchObject({ ok: false });
  });
});

describe("monoCacTrustees", () => {
  it("GETs the directors endpoint and maps names", async () => {
    fetchMock.mockReturnValue(ok({ data: [{ surname: "Obi", firstname: "Ada" }] }));
    expect(await monoCacTrustees("c1")).toEqual({ ok: true, data: [{ surname: "Obi", firstname: "Ada" }] });
    expect((fetchMock.mock.calls[0][0] as string)).toBe("https://api.withmono.com/v3/lookup/cac/company/c1/directors");
  });
});
