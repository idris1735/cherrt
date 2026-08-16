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
    church_legal_name: "Grace Chapel", it_number: "IT123456", address: "12 Lagos St", city: "Lagos",
    church_phone: "08031234567", full_name: "Ada Obi", position: "Trustee",
    id_type: "nin", id_number: "12345678901", email: "ada@grace.org",
  };
  it("passes a fully valid form", () => {
    expect(Object.keys(validateOnboard(good))).toHaveLength(0);
  });
  it("flags each bad/missing field", () => {
    const e = validateOnboard({ ...good, id_number: "12", email: "x", church_phone: "", full_name: "" });
    expect(e.id_number).toBeTruthy();
    expect(e.email).toBeTruthy();
    expect(e.church_phone).toBeTruthy();
    expect(e.full_name).toBeTruthy();
  });
});
