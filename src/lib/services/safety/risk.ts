// WS3 — lightweight inbound risk triage. Deterministic, fast, and runs BEFORE
// the agent sees the message so a scam can't be acted on and a safeguarding
// disclosure is never left to chance. No LLM involved in the decision.

export type RiskAssessment = { kind: "scam" | "safeguarding" | null; reason: string };

const CHILD = /\b(child|kid|minor|my (son|daughter|niece|nephew|ward))\b/i;
const HARM = /\b(hurt|hurting|hitting|beaten|beating|abused|abuse|touching|molest|assault|in danger)\b/i;
// Obvious accidental-injury context. The child-danger flag is suppressed ONLY
// when this is present AND no intentional-harm word is ("my son was hurt
// playing football, please pray" → a prayer request, not a safeguarding case).
// Detection words are unchanged, so real disclosures still fire.
const ACCIDENTAL = /\b(playing|fell|tripped|accident(al|ally)?|sport|football|soccer|basketball|game|match|bruis\w*|scraped|grazed|sprain\w*)\b/i;
const INTENTIONAL_HARM = /\b(hitting|beaten|beating|abused?|touching|molest|assault|in danger|harm(ed|ing)?)\b/i;

const SAFEGUARDING: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(suicid|kill myself|end my life|self.?harm|hurt myself|don'?t want to (live|be here))\b/i, reason: "self-harm or suicide signal" },
  { pattern: new RegExp(`(?=.*${CHILD.source})(?=.*${HARM.source}).+`, "i"), reason: "a child may be in danger" },
  { pattern: /\b(raped?|molested?|sexually abused|\babused\b)\b/i, reason: "abuse disclosure" },
  { pattern: /\b(threat(en(ed|ing|s)?)?|going to hurt (me|someone|him|her|them))\b/i, reason: "threat of harm" },
];

// Every condition must match for a scam flag — single weak words never trip it.
const MONEY = /\b(send|pay|transfer|deposit)\b/i;
const URGENCY = /\b(urgent|urgently|now|quick|asap|immediately|right away)\b/i;
const OTP = /\b(otp|one[- ]?time (pin|password|code)|verification code|bank code)\b/i;
const ASK_FOR_CODE = /\b(send|give|tell|share|confirm|verify|what|read)\b/i;
const NEW_ACCOUNT = /\bnew account\b/i;
// Directional: money going TO an account/number is the scam shape. Spending
// FROM the church account ("transfer ₦50k from the account urgently for diesel")
// is ordinary and must NOT trip the flag.
const TO_RECIPIENT = /\b(to|into)\s+((this|that|the|his|her|my|a|another|new|following|below)?\s*(account|acct|number|paystack|opay|moniepoint|kuda|wallet)\b|\d{6,})/i;
const IMPERSONATION = /\b(i am|i'?m)\s+(pastor|rev(erend)?\.?|pst|deacon|elder|president|baba|mama)\b/i;

const SCAM: { conds: RegExp[]; reason: string }[] = [
  { conds: [OTP, ASK_FOR_CODE], reason: "someone is asking for an OTP/verification code" },
  { conds: [MONEY, URGENCY, TO_RECIPIENT], reason: "urgent money request to an account" },
  { conds: [NEW_ACCOUNT, MONEY], reason: "money to a new/unknown account" },
  { conds: [IMPERSONATION, /\b(money|send|pay|transfer|urgent|urgently)\b/i], reason: "possible impersonation of a leader asking for money" },
  { conds: [/https?:\/\/\S*(verify|claim|winner|bonus|kpa|kyc)\S*/i], reason: "suspicious link" },
];

/** Classify a raw inbound message. Safeguarding outranks scam. */
export function assessRisk(text: string): RiskAssessment {
  const t = String(text ?? "").trim();
  if (!t) return { kind: null, reason: "" };
  for (const s of SAFEGUARDING) {
    if (s.pattern.test(t)) {
      // Don't fire the child-danger flag on plainly-accidental injury with no
      // intentional-harm word — that's a prayer request, not a disclosure.
      if (s.reason === "a child may be in danger" && ACCIDENTAL.test(t) && !INTENTIONAL_HARM.test(t)) continue;
      return { kind: "safeguarding", reason: s.reason };
    }
  }
  for (const s of SCAM) {
    if (s.conds.every((c) => c.test(t))) return { kind: "scam", reason: s.reason };
  }
  return { kind: null, reason: "" };
}
