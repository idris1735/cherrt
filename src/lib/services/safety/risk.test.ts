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

  it("does NOT flag ordinary church spending FROM the account (directional)", () => {
    // Regression: "money + account + urgency" alone used to trip the scam flag,
    // blocking a legit request. Spending FROM the account is not a scam shape.
    expect(assessRisk("transfer ₦50k from the account urgently for diesel").kind).toBeNull();
    expect(assessRisk("please pay the electrician now, it's urgent").kind).toBeNull();
  });

  it("still flags money going TO an account/number urgently", () => {
    expect(assessRisk("send ₦50k to this account now, it's urgent").kind).toBe("scam");
    expect(assessRisk("transfer ₦200k to 0123456789 immediately").kind).toBe("scam");
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

  it("does NOT flag a child accidentally hurt at play (no intentional-harm word)", () => {
    // Regression: "my son ... hurt" tripped the child-danger flag; an accidental
    // sports injury with a prayer request must be handled as prayer, not a
    // safeguarding disclosure.
    expect(assessRisk("my son was hurt playing football, please pray for him").kind).toBeNull();
    expect(assessRisk("my daughter fell and scraped her knee at the game").kind).toBeNull();
  });

  it("STILL flags a child hurt with an intentional-harm word even in a play context", () => {
    // The accidental guard must not create a loophole.
    expect(assessRisk("a man was hitting a child at the football game").kind).toBe("safeguarding");
  });
});
