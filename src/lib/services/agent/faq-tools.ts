// Church FAQ / knowledge (ChurchBase scenario 20): admins teach Chertt facts
// about their church (service times, giving account, address, policies) and she
// answers members from them instead of guessing. Reuses toolkit_knowledge_articles.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import type { AgentTool } from "@/lib/services/agent/tools";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const FAQ_TOOLS: AgentTool[] = [
  {
    name: "add_faq",
    description: "Teach me a fact about THIS church — a question and its answer (service times, giving account number, address, a policy). I'll use it to answer members accurately. Admins only.",
    parameters: {
      type: "object",
      properties: { question: { type: "string" }, answer: { type: "string" } },
      required: ["question", "answer"],
    },
    minRank: 2,
    mutates: true,
    handler: async (args, ctx) => {
      const question = String(args.question ?? "").trim();
      const answer = String(args.answer ?? "").trim();
      if (!question || !answer) return { error: "I need both the question and its answer." };
      const db = getSupabaseServerClient();
      if (!db) return { error: "storage unavailable" };
      const { error } = await db.from("toolkit_knowledge_articles").insert({
        id: randomUUID(),
        workspace_id: ctx.workspaceId,
        type: "faq",
        title: question,
        body: answer,
        tags: [],
      });
      if (error) return { error: error.message };
      return { ok: true, message: "✅ Got it — I'll remember that for your members." };
    },
  },
  {
    name: "get_faq",
    description: "Look up what this church has told me about a topic (service times, giving account, address, policies) so you can answer accurately. Use this before guessing any church-specific fact.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "What the person is asking about" } },
      required: ["topic"],
    },
    handler: async (args, ctx) => {
      const db = getSupabaseServerClient();
      if (!db) return { count: 0, answers: [] };
      // Sanitize before it goes into a PostgREST or() filter.
      const safe = String(args.topic ?? "").replace(/[^\w\s]/g, " ").trim();
      let q = db.from("toolkit_knowledge_articles").select("title, body").eq("workspace_id", ctx.workspaceId);
      if (safe) q = q.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
      const { data } = await q.limit(5);
      const answers = (data ?? []).map((r: any) => ({ q: r.title, a: r.body }));
      return { count: answers.length, answers };
    },
  },
];
