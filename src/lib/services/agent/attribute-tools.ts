// WS-B tools: the governed attributes bag. set_person_attribute is
// confirmation-gated (special-category writes must be confirmed + consented);
// get_person_attributes is data-sensitive and leaders-only for other people.

import type { AgentTool } from "@/lib/services/agent/tools";
import { setAttribute, getAttributes } from "@/lib/services/identity/attributes";
import { roleRank } from "@/lib/services/identity/role-catalog";

export const ATTRIBUTE_TOOLS: AgentTool[] = [
  {
    name: "set_person_attribute",
    description:
      "Store a small extra fact about a person (e.g. 'prefers Yoruba service', 'ushers on Sundays', 'night-shift nurse'). Core details (name, phone, email, gender, birthday, address) must NEVER go here — they have their own tools. Sensitive data (health, religion, ethnicity, political opinion, sexual orientation, biometrics) is refused unless the person explicitly consents (consentedSpecial: true).",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Short attribute name, e.g. 'prefers yoruba service'" },
        value: { type: "string", description: "The fact itself" },
        consentedSpecial: { type: "boolean", description: "Set true ONLY after the person explicitly agreed to store this sensitive fact" },
        personId: { type: "string", description: "Whose record (omit for the current member)" },
      },
      required: ["key", "value"],
    },
    requiresConfirmation: true,
    mutates: true,
    preview: (args) => `📝 Save "${String(args.key ?? "")}" to their record?`,
    handler: async (args, ctx) => {
      const target = String(args.personId ?? "").trim() || ctx.personId;
      if (!target) return { error: "I can't find whose record to update — ask them to message me first." };
      // Self-serve for members; touching someone else's record needs a leader.
      if (args.personId && args.personId !== ctx.personId && roleRank(ctx.role) < 1) {
        return { error: "Only a leader can add notes to someone else's record." };
      }
      const res = await setAttribute({
        personId: target,
        workspaceId: ctx.workspaceId,
        key: String(args.key ?? ""),
        value: String(args.value ?? ""),
        consentedSpecial: args.consentedSpecial === true,
      });
      if (!res.ok) return { error: res.reason ?? "Couldn't save that." };
      return { ok: true, category: res.category, message: `✅ Saved "${String(args.key ?? "")}" to their record.` };
    },
  },
  {
    name: "get_person_attributes",
    description:
      "Read the extra facts stored on a person's record (the attributes bag). Leaders can look anyone up; members only themselves.",
    parameters: {
      type: "object",
      properties: { personId: { type: "string", description: "Whose record (omit for the current member)" } },
    },
    dataSensitive: true,
    handler: async (args, ctx) => {
      const target = String(args.personId ?? "").trim() || ctx.personId;
      if (!target) return { error: "Tell me whose notes to look up." };
      if (args.personId && args.personId !== ctx.personId && roleRank(ctx.role) < 1) {
        return { error: "Only a leader can read someone else's notes." };
      }
      const attrs = await getAttributes(target);
      return { attributes: attrs, message: attrs.length ? `${attrs.length} note(s) on file.` : "No notes on file." };
    },
  },
];
