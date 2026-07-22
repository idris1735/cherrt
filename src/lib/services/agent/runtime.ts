// Bounded tool-calling loop. The model is offered the tool declarations; when
// it asks for a tool, we run the handler and feed the result back, looping
// until it answers in text or the step cap is hit. The `generate` function is
// injected so the loop is unit-testable without a live model.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { GoogleGenAI } from "@google/genai";
import { getSupabaseServerClient } from "@/lib/services/supabase-server";
import { READ_TOOLS, type AgentTool, type AgentContext } from "@/lib/services/agent/tools";
import { toolAccessError } from "@/lib/services/agent/access";
import { recordToolAudit, type ToolOutcome } from "@/lib/services/agent/audit";
import { ACTION_TOOLS } from "@/lib/services/agent/actions";
import { CHURCH_TOOLS } from "@/lib/services/agent/church-tools";
import { CHILD_TOOLS } from "@/lib/services/agent/child-tools";
import { COMMUNITY_TOOLS } from "@/lib/services/agent/community-tools";
import { JOURNEY_TOOLS } from "@/lib/services/agent/journey-tools";
import { ANNOUNCEMENT_TOOLS } from "@/lib/services/agent/announcement-tools";
import { PAYMENT_TOOLS } from "@/lib/services/agent/payment-tools";
import { buildMemberContext } from "@/lib/services/agent/member-context";
import { AGENT_PERSONA } from "@/lib/services/agent/persona";

// The full tool set the query agent is offered: read tools, safe action tools,
// church-operations tools, children's check-in, community "belonging" tools
// (events, departments), life-journey intakes, and announcements.
const AGENT_TOOLS: AgentTool[] = [
  ...READ_TOOLS,
  ...ACTION_TOOLS,
  ...CHURCH_TOOLS,
  ...CHILD_TOOLS,
  ...COMMUNITY_TOOLS,
  ...JOURNEY_TOOLS,
  ...ANNOUNCEMENT_TOOLS,
  ...PAYMENT_TOOLS,
];

export type ToolCall = { name: string; args: Record<string, unknown> };
export type GenerateResult = { functionCalls?: ToolCall[]; text?: string };
// `contents` is the running conversation array (kept model-shaped but opaque
// to the loop). Returns either tool calls to run or a final text answer.
export type GenerateFn = (contents: unknown[]) => Promise<GenerateResult>;

// The loop either answers in text, or proposes a consequential action that
// needs the user's confirmation before its handler runs.
export type AgentOutcome =
  | { kind: "text"; text: string }
  | { kind: "pending"; toolName: string; args: Record<string, unknown>; preview: string };

const DEFAULT_MAX_STEPS = 5;

// Look up any agent tool (read or action) by name — used by the processor to
// execute a confirmed pending action.
export function getAgentTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

const CREATE_VERBS_RE = /\b(create|draft|log|add|make|send|raise|record|generate|issue|register|book|schedule|write)\b/i;
const QUESTION_RE = /(\?\s*$)|^\s*(how|what|when|who|where|why|which|do|does|did|is|are|was|were|can|could|should|show|list|tell me|give me)\b/i;

// Cheap routing heuristic: is this free text a question to send to the read
// agent, rather than the creation path? Conservative — anything with a
// creation verb is left to the creator so we never steal a "create X" command.
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CREATE_VERBS_RE.test(t)) return false;
  return QUESTION_RE.test(t);
}

// Conservative match for the specific non-consequential actions the agent has
// tools for (expense / issue / inventory). Everything else — documents,
// payments, giving, requests — is left to the single-shot creator, so this
// only intercepts creations that need no confirmation.
const SAFE_ACTION_RE =
  /\b(log|record)\b[^?]*\b(expense|spent|paid|cost|diesel|fuel|petty\s*cash)\b|\breport\b[^?]*\b(issue|problem|fault|broken|leak|repair|not\s*working|facility)\b|\b(add|update)\b[^?]*\b(stock|inventory|item)\b|\brestock\b|\b(draft|write|prepare)\b[^?]*\b(letter|memo|invoice|document|note)\b/i;

// Church-operations phrasings that should reach the agent's church tools,
// including children's check-in / pickup.
const CHURCH_ACTION_RE =
  /\bpray(?:er)?\b|\bfirst[\s-]?timer?\b|\bnew\s+here\b|\b(pastoral|counsel(?:l)?ing)\b|\bsee\s+(?:a\s+)?pastor\b|\brecord\b[^?]*\b(giving|offering|tithe|donation|pledge)\b|\bnew\s+(?:visitor|convert|member)\b|\bcheck[\s-]?in\b|\bcheckin\b|\bpick(?:ing)?[\s-]?up\b|\bpickup\s*code\b|\bdrop(?:ping)?\s*off\b|\brelease\s+(?:the\s+)?child\b|\b(register|sign\s*up)\b[^?]*\b(event|retreat|conference|programme?|camp|crusade|convention)\b|\b(join|joining)\b[^?]*\b(department|ministry|unit|choir|ushering|media|team|group|drama|band)\b|\b(bereave\w*|funeral|passed\s+away|death\s+of|lost\s+(?:my|our))\b|\bmarriage\s*(?:prep|counsel\w*|class|course)\b|\b(?:getting\s+married|wedding)\b|\bbapti[sz]\w*\b|\b(?:new\s+convert|gave\s+(?:my|his|her)\s+life|got\s+saved|born\s+again|discipleship)\b|\b(announce\w*|broadcast)\b|\btell\s+(?:everyone|all\s+members|the\s+(?:church|congregation))\b|\b(?:want\s+to\s+|i'?d\s+like\s+to\s+|let\s+me\s+|can\s+i\s+)?give\b[^?]*\b(?:tithe|offering|seed|₦|\d{3,})|\bpay\s+(?:my\s+)?(?:tithe|offering)\b/i;

export function looksLikeAgentAction(text: string): boolean {
  const t = text.trim();
  return SAFE_ACTION_RE.test(t) || CHURCH_ACTION_RE.test(t);
}

export type MediaPart = { mimeType: string; data: string };

export async function runAgentLoop(opts: {
  generate: GenerateFn;
  tools: AgentTool[];
  ctx: AgentContext;
  systemPrompt: string;
  userPrompt: string;
  media?: MediaPart[];
  maxSteps?: number;
}): Promise<AgentOutcome> {
  const { generate, tools, ctx, systemPrompt, userPrompt, media } = opts;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const byName = new Map(tools.map((t) => [t.name, t]));

  // First turn carries the prompt plus any attached media (image/voice/doc), so
  // the model can see/hear it and call tools accordingly.
  const firstParts: unknown[] = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
  for (const m of media ?? []) firstParts.push({ inlineData: { mimeType: m.mimeType, data: m.data } });
  const contents: unknown[] = [{ role: "user", parts: firstParts }];

  for (let step = 0; step < maxSteps; step++) {
    const result = await generate(contents);

    if (!result.functionCalls || result.functionCalls.length === 0) {
      return { kind: "text", text: result.text ?? "" };
    }

    // A consequential tool the caller is ALLOWED to run is never executed during
    // reasoning — surface it for confirmation instead. (A confirmation tool the
    // caller may NOT run falls through to the execution loop and is denied there.)
    const confirmCall = result.functionCalls.find((c) => {
      const t = byName.get(c.name);
      return t?.requiresConfirmation && !toolAccessError(t, ctx);
    });
    if (confirmCall) {
      const tool = byName.get(confirmCall.name)!;
      const args = confirmCall.args ?? {};
      return {
        kind: "pending",
        toolName: confirmCall.name,
        args,
        preview: tool.preview?.(args) ?? `Confirm ${confirmCall.name}?`,
      };
    }

    // Record the model's tool-call turn.
    contents.push({
      role: "model",
      parts: result.functionCalls.map((fc) => ({ functionCall: { name: fc.name, args: fc.args } })),
    });

    // Execute each requested tool. Role gating first (denied → structured error,
    // never executed), then the handler; failures are fed back as a structured
    // error rather than thrown. Every attempt is audited.
    const responseParts: unknown[] = [];
    for (const call of result.functionCalls) {
      const tool = byName.get(call.name);
      const args = call.args ?? {};
      let response: unknown;
      if (!tool) {
        response = { error: `Unknown tool: ${call.name}` };
      } else {
        let outcome: ToolOutcome;
        const denied = toolAccessError(tool, ctx);
        if (denied) {
          response = { error: denied };
          outcome = "denied";
        } else if (tool.requiresConfirmation) {
          response = { error: "This action needs confirmation and can't be auto-run." };
          outcome = "error";
        } else {
          try {
            response = await tool.handler(args, ctx);
            outcome = "ok";
          } catch (e) {
            response = { error: e instanceof Error ? e.message : "tool failed" };
            outcome = "error";
          }
        }
        await recordToolAudit(ctx, call.name, args, outcome);
      }
      responseParts.push({ functionResponse: { name: call.name, response: { result: response } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Step cap reached — bail gracefully rather than loop forever.
  return { kind: "text", text: "I couldn't finish looking that up — please try rephrasing your question." };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// Per-workspace agent mode — the kill switch. 'off' pauses the agent entirely,
// 'readonly' hides mutating tools, 'full' is normal.
async function getWorkspaceAgentMode(workspaceId: string): Promise<"full" | "readonly" | "off"> {
  const db = getSupabaseServerClient();
  if (!db) return "full";
  const { data } = await db.from("workspaces").select("agent_mode").eq("id", workspaceId).maybeSingle();
  const mode = (data as { agent_mode?: string } | null)?.agent_mode;
  return mode === "readonly" || mode === "off" ? mode : "full";
}

// Production entry: builds the real Gemini `generate` and runs the tool loop.
// Optional media (image/voice/doc) is attached to the first turn so the agent
// is multimodal. Returns null when Gemini isn't configured (caller falls back).
export async function runAgentQuery(
  userPrompt: string,
  ctx: AgentContext,
  media?: MediaPart[],
): Promise<AgentOutcome | null> {
  const client = getGeminiClient();
  if (!client) return null;

  const mode = await getWorkspaceAgentMode(ctx.workspaceId);
  if (mode === "off") {
    // A true kill switch: don't fall through to the creator either.
    return { kind: "text", text: "Chertt is paused for your church right now — please reach out to a church admin." };
  }
  // In read-only mode the agent can look things up but not change anything.
  const tools = mode === "readonly" ? AGENT_TOOLS.filter((t) => !t.mutates) : AGENT_TOOLS;

  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const generate: GenerateFn = async (contents) => {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents as never,
      config: {
        tools: [{ functionDeclarations: functionDeclarations as never }],
        temperature: 0.3,
        maxOutputTokens: 800,
      },
    });
    const calls = (response.functionCalls ?? []).map((fc) => ({
      name: fc.name ?? "",
      args: (fc.args ?? {}) as Record<string, unknown>,
    }));
    return {
      functionCalls: calls.length ? calls : undefined,
      text: response.text ?? undefined,
    };
  };

  // Recall layer: prepend what we remember about this member so the agent can
  // follow up warmly. Read-only and best-effort — never blocks the answer.
  const memory = await buildMemberContext(ctx).catch(() => "");
  const systemPrompt = AGENT_PERSONA + memory;

  return runAgentLoop({ generate, tools, ctx, systemPrompt, userPrompt, media });
}
