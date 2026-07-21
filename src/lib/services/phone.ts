// Shared phone-number normalization. Extracted so both the identity layer
// (provisioning, resolver) and whatsapp-workspace can use it without a module
// cycle. Whatsapp-workspace re-exports it for back-compat.

// Both the WhatsApp webhook and /api/user/whatsapp-link must produce the exact
// same phone shape Meta's webhook sends (full international, no leading zero,
// no punctuation), or a link written from one path silently never matches an
// inbound message from the other. Returns null rather than a best-effort guess
// when the input is too short to plausibly be a number.
export function normalizePhoneNumber(raw: string): string | null {
  const stripped = raw.replace(/[\s\-().+]/g, "");
  if (!stripped || stripped.length < 7 || !/^\d+$/.test(stripped)) return null;
  return stripped.startsWith("0") ? `234${stripped.slice(1)}` : stripped;
}
