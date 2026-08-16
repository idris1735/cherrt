// Pure validation for the church onboarding form. Used client-side for inline
// errors and re-used server-side so we never trust the browser.

export type OnboardFields = {
  church_legal_name?: string;
  it_number?: string;
  address?: string;
  city?: string;
  country?: string;
  church_phone?: string;
  full_name?: string;
  position?: string;
  id_type?: string;
  id_number?: string;
  email?: string;
};

export type FieldErrors = Record<string, string>;

const req = (v?: string) => (v ?? "").trim();

// Nigerian phone: 0XXXXXXXXXX (11) or +234XXXXXXXXXX / 234XXXXXXXXXX.
export function normalizePhone(raw?: string): string {
  const d = req(raw).replace(/[^\d+]/g, "");
  if (/^0\d{10}$/.test(d)) return "+234" + d.slice(1);
  if (/^\+?234\d{10}$/.test(d)) return "+234" + d.replace(/^\+?234/, "");
  return d;
}
export function isValidPhone(raw?: string): boolean {
  return /^\+234\d{10}$/.test(normalizePhone(raw));
}
export function isValidEmail(raw?: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req(raw));
}
// NIN and BVN are both 11 digits. Spaces are tolerated (display grouping).
export function isValidId(idType: string | undefined, num?: string): boolean {
  return /^\d{11}$/.test(req(num).replace(/\s/g, ""));
}
// A real person name for trustee matching: at least two words of letters.
export function isValidFullName(raw?: string): boolean {
  return /^[A-Za-z'.-]+\s+[A-Za-z'.-]+(\s+[A-Za-z'.-]*)*$/.test(req(raw));
}
// CAC IT/RC numbers vary; require a sensible alphanumeric of 4–15 chars.
export function isValidItNumber(raw?: string): boolean {
  const v = req(raw).replace(/[\s/]/g, "");
  return /^[A-Za-z0-9-]{4,15}$/.test(v);
}

export function validateOnboard(f: OnboardFields & { position_other?: string }): FieldErrors {
  const e: FieldErrors = {};
  if (!req(f.church_legal_name)) e.church_legal_name = "Enter your church's legal name.";
  if (!req(f.it_number)) e.it_number = "Enter your CAC IT/RC number.";
  else if (!isValidItNumber(f.it_number)) e.it_number = "That doesn't look like a valid CAC IT/RC number (e.g. IT 12345 or RC 123456).";
  if (!req(f.city)) e.city = "Enter the church's city.";
  if (!req(f.address)) e.address = "Enter the street address.";
  if (!req(f.church_phone)) e.church_phone = "Enter the church's WhatsApp number.";
  else if (!isValidPhone(f.church_phone)) e.church_phone = "Use a valid Nigerian WhatsApp number, e.g. 0803 123 4567.";
  if (!req(f.full_name)) e.full_name = "Enter your full name (as on your ID).";
  else if (!isValidFullName(f.full_name)) e.full_name = "Enter your first and last name, as on your ID.";
  if (!req(f.position)) e.position = "Select your position.";
  else if (f.position === "Other" && !req(f.position_other)) e.position_other = "Tell us your position.";
  if (!req(f.id_number)) e.id_number = "Enter your ID number.";
  else if (!isValidId(f.id_type, f.id_number)) e.id_number = `Your ${(f.id_type || "NIN").toUpperCase()} must be exactly 11 digits.`;
  if (!req(f.email)) e.email = "Enter your email.";
  else if (!isValidEmail(f.email)) e.email = "Enter a valid email address.";
  return e;
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
export function fileError(file: File | null, label: string): string | null {
  if (!file) return `${label} is required.`;
  if (!/^image\/|^application\/pdf$/.test(file.type)) return `${label} must be an image or PDF.`;
  if (file.size > MAX_FILE_BYTES) return `${label} is too large (max 5MB). Try a smaller photo.`;
  return null;
}
