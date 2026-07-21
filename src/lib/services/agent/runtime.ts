// Bounded tool-calling loop. The model is offered the tool declarations; when
// it asks for a tool, we run the handler and feed the result back, looping
// until it answers in text or the step cap is hit. The `generate` function is
// injected so the loop is unit-testable without a live model.
// See docs/superpowers/specs/2026-07-21-agentic-engine-design.md

import { GoogleGenAI } from "@google/genai";
import { READ_TOOLS, type AgentTool, type AgentContext } from "@/lib/services/agent/tools";

export type ToolCall = { name: string; args: Record<string, unknown> };
export type GenerateResult = { functionCalls?: ToolCall[]; text?: string };
// `contents` is the running conversation array (kept model-shaped but opaque
// to the loop). Returns either tool calls to run or a final text answer.
export type GenerateFn = (contents: unknown[]) => Promise<GenerateResult>;

const DEFAULT_MAX_STEPS = 5;

export async function runAgentLoop(opts: {
  generate: GenerateFn;
  tools: AgentTool[];
  ctx: AgentContext;
  systemPrompt: string;
  userPrompt: string;
  maxSteps?: number;
}): Promise<string> {
  const { generate, tools, ctx, systemPrompt, userPrompt } = opts;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const byName = new Map(tools.map((t) => [t.name, t]));

  const contents: unknown[] = [
    { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
  ];

  for (let step = 0; step < maxSteps; step++) {
    const result = await generate(contents);

    if (!result.functionCalls || result.functionCalls.length === 0) {
      return result.text ?? "";
    }

    // Record the model's tool-call turn.
    contents.push({
      role: "model",
      parts: result.functionCalls.map((fc) => ({ functionCall: { name: fc.name, args: fc.args } })),
    });

    // Execute each requested tool; a failure is fed back as a structured error
    // rather than thrown out of the loop, so the model can recover or explain.
    const responseParts: unknown[] = [];
    for (const call of result.functionCalls) {
      const tool = byName.get(call.name);
      let response: unknown;
      if (!tool) {
        response = { error: `Unknown tool: ${call.name}` };
      } else {
        try {
          response = await tool.handler(call.args ?? {}, ctx);
        } catch (e) {
          response = { error: e instanceof Error ? e.message : "tool failed" };
        }
      }
      responseParts.push({ functionResponse: { name: call.name, response: { result: response } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // Step cap reached — bail gracefully rather than loop forever.
  return "I couldn't finish looking that up — please try rephrasing your question.";
}

const AGENT_SYSTEM_PROMPT = [
  "You are Chertt, an assistant that helps run a business or church over WhatsApp.",
  "Answer the user's question using the tools to look up real workspace data — do not guess numbers.",
  "Be concise and specific. If a tool returns no data, say so plainly rather than inventing figures.",
].join(" ");

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// Production entry: builds the real Gemini `generate` and runs the read-tool
// loop. Returns null when Gemini isn't configured (caller falls back).
export async function runAgentQuery(userPrompt: string, ctx: AgentContext): Promise<string | null> {
  const client = getGeminiClient();
  if (!client) return null;

  const functionDeclarations = READ_TOOLS.map((t) => ({
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

  return runAgentLoop({ generate, tools: READ_TOOLS, ctx, systemPrompt: AGENT_SYSTEM_PROMPT, userPrompt });
}
