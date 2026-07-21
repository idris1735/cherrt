# Agentic Engine — Design Spec

**Date:** 2026-07-21
**Status:** Design + foundation in progress (decisions made by the implementer per "skip the ceremony, keep coding"; open to revision).

---

## 1. Problem

`runCherttCommand` (ai-service.ts, ~1450 lines) is a **single-shot classifier**: intent-router picks ONE capability → ONE `callGemini` call in JSON mode (no tools) → a giant flat `GeminiResponse` → builds at most ONE artifact. It can only **create**. It cannot query/read data ("how many members?", "what did we spend this month?"), cannot take multiple steps, and has no function-calling. Workspace data reaches the model only as a stuffed `memoryContext` string. This is the root of "feels like a bot, can't really report/act."

Deterministic report matchers (`matchReportIntent`) partly fill reads, but they're rigid one-shot templates, not a reasoning agent.

## 2. Target

A bounded **tool-calling loop**: Gemini is given a set of typed tools (read first, then actions), calls them as needed, sees the results, and can chain steps before answering — the "crazy work rate" engine. It runs the same tools the dashboard would, scoped to the caller's workspace and role.

## 3. Decisions

1. **SDK / model:** Gemini 2.5 Flash function-calling via the existing `@google/genai` (`generateContent` with `config.tools = [{ functionDeclarations }]`). No new dependency.
2. **Bounded loop:** send contents + tool declarations → if the model returns `functionCall`s, execute their handlers, append `functionResponse` parts, loop → else return the model's text. Hard cap (default 5 steps) to prevent runaway.
3. **Tool registry:** `AgentTool { name, description, parameters (JSON schema), handler(args, ctx) }`. Handlers are async, call existing services, return JSON-serializable results. **Read tools first** (no side effects); action tools land in a later increment behind the existing confirmation gating.
4. **Tenant scoping:** every handler receives `AgentContext { workspaceId, role, userName }` and is scoped to that workspace — no cross-tenant reads. Capability/role gating reuses `policy-guard`.
5. **Coexistence, phased:**
   - **Increment 1 (this):** standalone, fully-tested foundation — tool registry (read tools) + the loop — **not yet wired** into the processor. Zero risk to the live path.
   - **Increment 2:** wire the agent as the handler for free-text that the deterministic report matcher and known creation intents don't catch (the query gap today), returning its text answer over WhatsApp.
   - **Increment 3+:** add action tools (create request/expense/etc.) through the SAME confirmation gate, and gradually subsume the single-shot creator.
6. **Safety:** read tools are side-effect-free. Tool errors are caught and returned to the model as a structured `{ error }` result (never thrown out of the loop). The loop is step-bounded. Action tools (later) never execute a consequential change without the existing confirmation step.
7. **Testability:** the loop takes an injected `generate` function so it can be unit-tested with a fake model that emits tool calls then text — no live Gemini needed. The production entry builds the real `generate` from `@google/genai`.

## 4. Increment 1 scope (foundation)

- `src/lib/services/agent/tools.ts` — `AgentTool`/`AgentContext` types + initial **read** tools wired to existing services:
  - `get_giving_summary` → `getGivingSummary`
  - `get_pending_requests` → `loadWorkspaceContext().pendingRequests`
  - `get_low_stock` → `loadWorkspaceContext().lowInventoryItems`
  - `get_open_issues` → `loadWorkspaceContext().pendingIssues`
  - `list_members` → `listBranchMembers` (identity spine)
- `src/lib/services/agent/runtime.ts` — `runAgentLoop` (injected `generate`, bounded, executes tools, feeds results back) + `runAgentQuery` (builds the real Gemini `generate` and runs the loop with the read-tool registry).
- Tests: tool registry shape/scoping; loop executes a tool call and returns text; loop respects the step cap; tool-handler error surfaces as a structured result, not a throw.

## 5. Out of scope (later increments)
Wiring into the WhatsApp processor · action tools + confirmation gating · subsuming the single-shot creator · multi-tool parallel calls beyond the basics · streaming.
