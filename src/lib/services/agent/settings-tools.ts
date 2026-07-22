// Church-level settings an admin can change conversationally. Currently: the
// per-church personality flavour. Admin/pastor only.
// See src/lib/services/agent/persona.ts for how it's layered in.

import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

const RESET_RE = /^(reset|default|normal|none|clear)$/i;

export const SETTINGS_TOOLS: AgentTool[] = [
  {
    name: "set_church_personality",
    description:
      "Set how you (Chertt) should sound for THIS church — a short style note, e.g. 'more formal and scripture-heavy', or 'playful and youthful, plenty of Pidgin'. Admins/pastors only. It flavours your voice; it never changes the safety rules. Pass 'reset' to go back to the normal voice.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "How Chertt should sound for this church, or 'reset'" },
      },
      required: ["description"],
    },
    minRank: 4, // admins / pastors set the church's public voice
    mutates: true,
    handler: async (args, ctx) => {
      const desc = String(args.description ?? "").trim();
      if (!desc) return { error: "Tell me how you'd like me to sound for your church." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };

      if (RESET_RE.test(desc)) {
        const { error } = await db.from("workspaces").update({ agent_persona: null }).eq("id", ctx.workspaceId);
        if (error) return { error: error.message };
        return { ok: true, message: "Back to my normal voice. 👍" };
      }
      if (desc.length > 800) return { error: "Keep the style note under ~800 characters, please." };

      const { error } = await db.from("workspaces").update({ agent_persona: desc }).eq("id", ctx.workspaceId);
      if (error) return { error: error.message };
      return { ok: true, message: "Done — I'll sound like that for your church from now on. 🙌" };
    },
  },
];
