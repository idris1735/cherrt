// Warm, deterministic acknowledgments for the RELATIONAL things a member says
// that aren't a task or a question — "praise God", "thank you", "God bless you",
// "amen", "good night". The bot stays human (it answers the moment) and then,
// separately, offers the menu so the turn still has direction. No LLM: these are
// instant and never wander. This runs only AFTER every deterministic rail and
// the question/action gate have passed, so anything matched here is genuinely
// social — there's no task hiding inside it.

type SocialKind = "praise" | "thanks" | "blessing" | "affirm" | "farewell";

// Order matters: a more specific intent is listed before a broader one so, e.g.,
// "God bless you" reads as a blessing rather than falling through to praise.
const SOCIAL_RULES: Array<{ kind: SocialKind; re: RegExp }> = [
  { kind: "blessing", re: /\bgod bless (you|u)\b|\b(stay|remain) blessed\b|\bbless (you|u)\b|\bsafe (journey|trip)\b/i },
  { kind: "thanks", re: /\b(thank(s| you| u)?|tanks|i appreciate (it|you|this)|i'?m (so )?grateful|much obliged|well done)\b/i },
  { kind: "praise", re: /\bpraise (the )?(god|lord|jesus)\b|\bglory( to god| be to god)?\b|\bhalleluyah|hallelujah\b|\bto god be (all )?the glory\b|\bgod is (good|great|faithful|able)\b|\bthank (god|you jesus)\b|\bwhat a (service|sermon|word|message|time|day|move)\b|\b(wonderful|powerful|blessed|amazing|great) (service|sermon|word|message|time)\b/i },
  { kind: "affirm", re: /^(amen+|amin|so shall it be|i receive (it|this)|it is well|so be it)\b/i },
  { kind: "farewell", re: /^(bye+|goodbye|good ?night|see you( later| soon)?|catch you later|take care|later)\b/i },
];

// Short, human, and non-repetitive across the categories. Each already carries
// its own warmth; the menu offer is appended by the caller, not here.
const REPLIES: Record<SocialKind, string> = {
  praise: "Amen — to God be the glory! 🙏",
  thanks: "You're most welcome. 🙏",
  blessing: "And you too — God bless you. 🙏",
  affirm: "Amen! 🙏",
  farewell: "Stay blessed — I'm right here whenever you need me. 🙏",
};

// Returns a warm acknowledgment for a relational message, or null when the text
// isn't social (the caller then shows the menu with a "didn't catch that" lead).
export function matchSocialAck(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const { kind, re } of SOCIAL_RULES) if (re.test(t)) return REPLIES[kind];
  return null;
}
