// WS-B: governed flexible attributes — the ONLY place the AI may store the
// long tail of facts about a person. Special-category data (health, religion,
// ethnicity, political opinion, sexual orientation, biometric) is refused
// unless the caller passes explicit special consent. Core fields (name, phone,
// email, gender, DOB, address, roles, giving, verification) NEVER belong here.

import { getSupabaseServerClient } from "@/lib/services/supabase-server";

export type PersonAttribute = {
  key: string;
  value: string | null;
  category: "normal" | "special";
  source: string;
  createdAt: string;
  updatedAt: string;
};

// NDPR special categories — checked against BOTH the key and the value so a
// health fact can't slip in under a neutral key (or vice versa).
export const SPECIAL_CLASSIFIERS: Record<string, RegExp> = {
  health: /\b(health|sick|ill|disease|diagnos\w*|condition|allerg\w*|hiv|aids|diabet\w*|asthma|pregnan\w*|mental|cancer|sickle|blood\s*pressure|therapy|medication|disab\w*)\b/i,
  religion: /\b(religio\w*|faith|muslim|islam\w*|christian\w*|convert\w*|denomination)\b/i,
  ethnicity: /\b(ethnic\w*|tribe|yoruba|igbo|hausa|edo|ijaw|fulani|ibibio|kanuri|tiv)\b/i,
  political: /\b(politic\w*|party|apc\b|pdp\b|lp\b|election|candidate)\b/i,
  sexualOrientation: /\b(sexual|orientation|gay|lesbian|lgbt\w*|gender\s*identity)\b/i,
  biometric: /\b(biometric\w*|fingerprint\w*|dna|retina\w*|iris\w*|facial)\b/i,
};

export function classifySpecial(key: string, value: string): boolean {
  const hay = `${key} ${value}`;
  return Object.values(SPECIAL_CLASSIFIERS).some((re) => re.test(hay));
}

export function normalizeAttributeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function setAttribute(opts: {
  personId: string;
  workspaceId?: string | null;
  key: string;
  value: string;
  source?: string;
  consentedSpecial?: boolean;
}): Promise<{ ok: boolean; reason?: string; category?: "normal" | "special" }> {
  const db = getSupabaseServerClient();
  if (!db) return { ok: false, reason: "storage unavailable" };
  const key = normalizeAttributeKey(opts.key);
  const value = String(opts.value ?? "").trim();
  if (!key || !value) return { ok: false, reason: "Both the attribute name and value are needed." };

  // HARD GUARDRAIL: special-category data requires explicit special consent.
  const isSpecial = classifySpecial(key, value);
  if (isSpecial && opts.consentedSpecial !== true) {
    return { ok: false, reason: "That's sensitive personal data — I need the person's explicit consent before storing it." };
  }
  const category: "normal" | "special" = isSpecial ? "special" : "normal";

  const now = new Date().toISOString();
  const { error } = await db.from("person_attributes").upsert(
    {
      person_id: opts.personId,
      workspace_id: opts.workspaceId ?? null,
      key,
      value,
      category,
      source: opts.source ?? "whatsapp",
      updated_at: now,
    },
    { onConflict: "person_id,key" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true, category };
}

export async function getAttributes(personId: string): Promise<PersonAttribute[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  const { data } = await db
    .from("person_attributes")
    .select("key, value, category, source, created_at, updated_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    key: String(r.key),
    value: (r.value as string) ?? null,
    category: (r.category as "normal" | "special") ?? "normal",
    source: String(r.source),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}
