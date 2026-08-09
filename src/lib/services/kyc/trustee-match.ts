import type { MonoTrustee } from "@/lib/services/kyc/mono";

// A trustee matches when BOTH their surname and firstname appear in the
// applicant's stated name (case-insensitive, order-independent). Empty trustee
// list → unknown (Mono couldn't confirm), so the reviewer decides.
export function matchTrustee(applicantName: string, trustees: MonoTrustee[]): "match" | "no_match" | "unknown" {
  if (!trustees.length) return "unknown";
  const words = new Set(applicantName.toLowerCase().split(/\s+/).filter(Boolean));
  const hit = trustees.some((t) => words.has(t.surname.toLowerCase()) && words.has(t.firstname.toLowerCase()));
  return hit ? "match" : "no_match";
}
