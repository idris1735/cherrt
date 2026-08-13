import { describe, it, expect } from "vitest";

import { assessRisk } from "@/lib/services/safety/risk";

describe("assessRisk — scam detection", () => {
  it("flags urgent money to a new account number", () => {
    const r = assessRisk("Send ₦200k to 0123456789 now, it's urgent, new account");
    expect(r.kind).toBe("scam");
    expect(r.reason).toMatch(/money/i);
  });

  it("flags anyone asking for an OTP / verification code", () => {
    expect(assessRisk("what is the OTP code you just received? send it to me").kind).toBe("scam");
    expect(assessRisk("I need your verification code to confirm your account").kind).toBe("scam");
  });

  it("flags impersonation with urgency", () => {
    expect(assessRisk("I am Pastor Ade, send money to this account urgently for the church project").kind).toBe("scam");
  });

  it("flags phishing links", () => {
    expect(assessRisk("click http://chertt-verify.example.com to verify your account and claim your gift").kind).toBe("scam");
  });

  it("returns null for ordinary messages", () => {
    expect(assessRisk("What time is service on Sunday?").kind).toBeNull();
    expect(assessRisk("please add my prayer request for my exams").kind).toBeNull();
  });
});

describe("assessRisk — safeguarding detection", () => {
  it("flags a child in danger", () => {
    const r = assessRisk("someone is hurting a child in my street");
    expect(r.kind).toBe("safeguarding");
    expect(r.reason).toMatch(/child/i);
  });

  it("flags abuse disclosures", () => {
    expect(assessRisk("I was abused and I want to tell someone").kind).toBe("safeguarding");
  });

  it("flags self-harm and suicide", () => {
    expect(assessRisk("I want to kill myself tonight").kind).toBe("safeguarding");
    expect(assessRisk("I keep thinking about self-harm").kind).toBe("safeguarding");
  });

  it("flags threats against someone", () => {
    expect(assessRisk("he threatened to hurt me if I tell").kind).toBe("safeguarding");
  });

  it("safeguarding outranks scam when both present", () => {
    expect(assessRisk("they abused my child and now want money from my account").kind).toBe("safeguarding");
  });
});
