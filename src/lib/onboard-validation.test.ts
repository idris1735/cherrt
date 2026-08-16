import { describe, it, expect } from "vitest";
import { validateOnboard, normalizePhone, isValidPhone, isValidId, isValidItNumber, isValidEmail } from "./onboard-validation";

describe("field validators", () => {
  it("normalizes Nigerian phones to +234", () => {
    expect(normalizePhone("08031234567")).toBe("+2348031234567");
    expect(normalizePhone("+2348031234567")).toBe("+2348031234567");
    expect(normalizePhone("2348031234567")).toBe("+2348031234567");
  });
  it("validates phone / id / email / IT number", () => {
    expect(isValidPhone("0803 123 4567")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidId("nin", "12345678901")).toBe(true);
    expect(isValidId("nin", "123")).toBe(false);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidItNumber("IT-123456")).toBe(true);
    expect(isValidItNumber("!")).toBe(false);
  });
});

describe("validateOnboard", () => {
  const good = {
    church_legal_name: "Grace Chapel", it_number: "IT123456", address: "12 Salawa Street",
    city: "Ikeja", state: "Lagos", country: "NG",
    church_phone: "08031234567", full_name: "Ada Obi", position: "Trustee",
    id_type: "nin", id_number: "12345678901", email: "ada@grace.org",
  };
  it("passes a fully valid form", () => {
    expect(Object.keys(validateOnboard(good))).toHaveLength(0);
  });
  it("location — rejects a missing/unknown state, city, or non-Nigeria country", () => {
    expect(validateOnboard({ ...good, country: "US" }).country).toBeTruthy();
    expect(validateOnboard({ ...good, country: "ZZ" }).country).toBeTruthy();
    const noState = { ...good, state: "" };
    expect(validateOnboard(noState).state).toBeTruthy();
    expect(validateOnboard({ ...good, state: "Atlantis" }).state).toBeTruthy();
    expect(validateOnboard({ ...good, city: "NotACity" }).city).toBeTruthy();
    expect(validateOnboard({ ...good, city: "Kano", state: "Lagos" }).city).toBeTruthy(); // not in that state
  });
  it("location — city Other requires a typed town, and dataset cities pass", () => {
    const otherEmpty = { ...good, city: "Other", city_other: "" };
    expect(validateOnboard(otherEmpty).city).toBeTruthy();
    expect(Object.keys(validateOnboard({ ...good, city: "Other", city_other: "My Town" }))).toHaveLength(0);
    expect(Object.keys(validateOnboard({ ...good, city: "Lagos", state: "Lagos" }))).toHaveLength(0);
  });
  it("P2-2/P2-3 — username + website are optional and validated only when present", () => {
    expect(Object.keys(validateOnboard({ ...good, username: "", website: "" }))).toHaveLength(0);
    const e = validateOnboard({ ...good, username: "BAD HANDLE!", website: "not a url" });
    expect(e.username).toBeTruthy();
    expect(e.website).toBeTruthy();
    expect(Object.keys(validateOnboard({ ...good, username: "daystar_cc", website: "https://grace.org" }))).toHaveLength(0);
  });
  it("flags each bad/missing field", () => {
    const e = validateOnboard({ ...good, id_number: "12", email: "x", church_phone: "", full_name: "" });
    expect(e.id_number).toBeTruthy();
    expect(e.email).toBeTruthy();
    expect(e.church_phone).toBeTruthy();
    expect(e.full_name).toBeTruthy();
  });
});
