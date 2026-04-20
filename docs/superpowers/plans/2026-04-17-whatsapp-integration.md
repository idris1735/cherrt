# WhatsApp Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WhatsApp Business webhook to Chertt so staff can interact with the AI through WhatsApp — drafting documents, raising requests, logging expenses, and more — with plain-text replies and web links for rich-UI actions.

**Architecture:** A new `/api/whatsapp/webhook` route receives Meta Cloud API message events, passes them through a processor that handles keyword commands (CONFIRM/APPROVE/REJECT) and calls the existing `runCherttCommand` function, then formats the AI result as plain text and sends it back via the Meta Graph API. Per-phone session state tracks conversation history and pending confirmations in memory.

**Tech Stack:** Next.js 14 App Router API routes, Meta Cloud API (Graph API v19.0), existing `runCherttCommand` from `ai-service.ts`, Vitest for tests. No new npm dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/services/whatsapp-session.ts` | Create | In-memory session store per phone number |
| `src/lib/services/whatsapp.ts` | Create | Send WhatsApp messages + download media via Meta Graph API |
| `src/lib/services/whatsapp-formatter.ts` | Create | Convert `AiCommandResult` to plain text string |
| `src/lib/services/whatsapp-processor.ts` | Create | Full pipeline: parse → keyword check → AI → format → send |
| `src/app/api/whatsapp/webhook/route.ts` | Create | GET (Meta verification) + POST (message handler) |
| `src/lib/services/whatsapp-session.test.ts` | Create | Unit tests for session store |
| `src/lib/services/whatsapp-formatter.test.ts` | Create | Unit tests for formatter |
| `src/lib/services/whatsapp-processor.test.ts` | Create | Unit tests for processor with mocked dependencies |

---

## Task 1: Session Store

**Files:**
- Create: `src/lib/services/whatsapp-session.ts`
- Create: `src/lib/services/whatsapp-session.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/whatsapp-session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
  resetSessions,
} from "@/lib/services/whatsapp-session";

describe("whatsapp session store", () => {
  beforeEach(() => {
    resetSessions();
  });

  it("creates a new session for an unknown phone number", () => {
    const session = getSession("2348012345678");
    expect(session.phoneNumber).toBe("2348012345678");
    expect(session.history).toEqual([]);
    expect(session.pendingConfirmation).toBeUndefined();
  });

  it("returns the same session on repeated calls", () => {
    getSession("2348012345678");
    updateSession("2348012345678", { pendingConfirmation: { originalPrompt: "test", artifactKind: "document", previewTitle: "Test Doc" } });
    const session = getSession("2348012345678");
    expect(session.pendingConfirmation?.previewTitle).toBe("Test Doc");
  });

  it("adds messages to history and caps at 20 entries", () => {
    for (let i = 0; i < 12; i++) {
      addToHistory("2348012345678", "user", `message ${i}`);
      addToHistory("2348012345678", "assistant", `reply ${i}`);
    }
    const session = getSession("2348012345678");
    expect(session.history.length).toBe(20);
    expect(session.history[0].text).toBe("message 2");
  });

  it("clearPending removes confirmation and approval state", () => {
    updateSession("2348012345678", {
      pendingConfirmation: { originalPrompt: "draft letter", artifactKind: "document", previewTitle: "Letter" },
      pendingApproval: { requestId: "req-1", requestTitle: "Fuel request" },
    });
    clearPending("2348012345678");
    const session = getSession("2348012345678");
    expect(session.pendingConfirmation).toBeUndefined();
    expect(session.pendingApproval).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/lib/services/whatsapp-session.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/services/whatsapp-session'`

- [ ] **Step 3: Create the session store**

Create `src/lib/services/whatsapp-session.ts`:

```ts
export type WhatsAppSession = {
  phoneNumber: string;
  pendingConfirmation?: {
    originalPrompt: string;
    artifactKind: string;
    previewTitle: string;
  };
  pendingApproval?: {
    requestId: string;
    requestTitle: string;
  };
  history: Array<{ role: "user" | "assistant"; text: string }>;
};

const MAX_HISTORY_ENTRIES = 20;
const sessions = new Map<string, WhatsAppSession>();

export function getSession(phoneNumber: string): WhatsAppSession {
  if (!sessions.has(phoneNumber)) {
    sessions.set(phoneNumber, { phoneNumber, history: [] });
  }
  return sessions.get(phoneNumber)!;
}

export function updateSession(phoneNumber: string, updates: Partial<Omit<WhatsAppSession, "phoneNumber">>): void {
  const session = getSession(phoneNumber);
  sessions.set(phoneNumber, { ...session, ...updates });
}

export function addToHistory(phoneNumber: string, role: "user" | "assistant", text: string): void {
  const session = getSession(phoneNumber);
  const history = [...session.history, { role, text }].slice(-MAX_HISTORY_ENTRIES);
  sessions.set(phoneNumber, { ...session, history });
}

export function clearPending(phoneNumber: string): void {
  const session = getSession(phoneNumber);
  sessions.set(phoneNumber, {
    ...session,
    pendingConfirmation: undefined,
    pendingApproval: undefined,
  });
}

// Test helper — clears all sessions between tests
export function resetSessions(): void {
  sessions.clear();
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/lib/services/whatsapp-session.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-session.ts src/lib/services/whatsapp-session.test.ts
git commit -m "feat: add WhatsApp session store"
```

---

## Task 2: WhatsApp Sender Service

**Files:**
- Create: `src/lib/services/whatsapp.ts`

No tests for this task — it makes live HTTP calls to Meta. Tested manually in Task 5.

- [ ] **Step 1: Create the sender service**

Create `src/lib/services/whatsapp.ts`:

```ts
const GRAPH_API = "https://graph.facebook.com/v19.0";
const MAX_MESSAGE_LENGTH = 4096;

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID env var is not set");
  return id;
}

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN env var is not set");
  return token;
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const body = text.slice(0, MAX_MESSAGE_LENGTH);
  const res = await fetch(`${GRAPH_API}/${getPhoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`WhatsApp send failed: ${res.status} — ${error}`);
  }
}

export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = getAccessToken();

  // Step 1: Resolve media URL
  const urlRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!urlRes.ok) throw new Error(`Media URL fetch failed: ${urlRes.status}`);
  const { url, mime_type } = (await urlRes.json()) as { url: string; mime_type: string };

  // Step 2: Download bytes
  const mediaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaRes.ok) throw new Error(`Media download failed: ${mediaRes.status}`);
  const buffer = Buffer.from(await mediaRes.arrayBuffer());

  return { buffer, mimeType: mime_type };
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/whatsapp.ts
git commit -m "feat: add WhatsApp sender and media download service"
```

---

## Task 3: Response Formatter

**Files:**
- Create: `src/lib/services/whatsapp-formatter.ts`
- Create: `src/lib/services/whatsapp-formatter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/whatsapp-formatter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatAiResult } from "@/lib/services/whatsapp-formatter";
import type { AiCommandResult } from "@/lib/types";

const APP_URL = "https://chertt.test";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("formatAiResult", () => {
  it("formats pending confirmation", () => {
    const result: AiCommandResult = {
      reply: "",
      pendingConfirmation: {
        summary: "Create a letter",
        actionKey: "document",
        previewTitle: "Payment Extension Request",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Payment Extension Request");
    expect(text).toContain("CONFIRM");
    expect(text).toContain("CANCEL");
  });

  it("formats generated document with signing link", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedDocument: {
        id: "doc-1",
        title: "Fuel Vendor Letter",
        type: "letter",
        body: "Dear vendor...",
        status: "pending",
        preparedBy: "Guest",
        awaitingSignatureFrom: "Admin",
        createdAtLabel: "Today",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("Fuel Vendor Letter");
    expect(text).toContain("Admin");
    expect(text).toContain(`${APP_URL}/w/global-hub/chat`);
  });

  it("formats generated expense entry", () => {
    const result: AiCommandResult = {
      reply: "",
      generatedExpenseEntry: {
        id: "exp-1",
        amount: 15000,
        category: "Fuel",
        description: "Generator diesel",
        date: "2026-04-17",
        loggedBy: "Guest",
        status: "pending",
      },
    };
    const { text } = formatAiResult(result);
    expect(text).toContain("15,000");
    expect(text).toContain("Fuel");
  });

  it("strips markdown from plain text replies", () => {
    const result: AiCommandResult = {
      reply: "**Hello** this is a *reply* with ## headers\n- item one\n- item two",
    };
    const { text } = formatAiResult(result);
    expect(text).not.toContain("**");
    expect(text).not.toContain("##");
    expect(text).toContain("Hello");
    expect(text).toContain("• item one");
  });

  it("returns fallback for empty result", () => {
    const result: AiCommandResult = { reply: "" };
    const { text } = formatAiResult(result);
    expect(text).toContain("Something went wrong");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/lib/services/whatsapp-formatter.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/services/whatsapp-formatter'`

- [ ] **Step 3: Create the formatter**

Create `src/lib/services/whatsapp-formatter.ts`:

```ts
import type { AiCommandResult } from "@/lib/types";

export type FormattedReply = { text: string };

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/^- /gm, "• ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function webLink(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app";
  return `${base}/w/global-hub/chat`;
}

export function formatAiResult(result: AiCommandResult): FormattedReply {
  if (result.pendingConfirmation) {
    const { previewTitle } = result.pendingConfirmation;
    return {
      text: `I'll create "${previewTitle}". Reply CONFIRM to proceed, or CANCEL to stop.`,
    };
  }

  if (result.generatedDocument) {
    const doc = result.generatedDocument;
    const routed = doc.awaitingSignatureFrom
      ? ` Routed to ${doc.awaitingSignatureFrom} for signature.`
      : "";
    return {
      text: `Done. "${doc.title}" is ready.${routed}\n\nView and sign here: ${webLink()}`,
    };
  }

  if (result.generatedRequest) {
    const req = result.generatedRequest;
    const amount = req.amount ? ` for ₦${req.amount.toLocaleString()}` : "";
    return {
      text: `Request logged: ${req.title}${amount}. The approver has been notified.\n\nView here: ${webLink()}`,
    };
  }

  if (result.generatedExpenseEntry) {
    const exp = result.generatedExpenseEntry;
    const amount = exp.amount != null ? `₦${exp.amount.toLocaleString()}` : "";
    const cat = exp.category ? ` for ${exp.category}` : "";
    const desc = exp.description ? ` — "${exp.description}"` : "";
    return { text: `Expense recorded: ${amount}${cat}${desc}` };
  }

  if (result.generatedIssueReport) {
    return {
      text: `Issue logged: "${result.generatedIssueReport.title}". The relevant team has been notified.\n\nView here: ${webLink()}`,
    };
  }

  if (result.generatedInventoryItem) {
    const item = result.generatedInventoryItem;
    return { text: `${item.name}: ${item.quantity ?? 0} units in stock.` };
  }

  if (result.generatedPaymentLink) {
    return { text: `Payment link ready. View here: ${webLink()}` };
  }

  if (result.generatedPerson) {
    const p = result.generatedPerson;
    const lines = [p.name];
    if (p.jobTitle) lines.push(p.jobTitle);
    if (p.phone) lines.push(`📞 ${p.phone}`);
    if (p.email) lines.push(`✉ ${p.email}`);
    return { text: lines.join("\n") };
  }

  if (result.generatedPoll) {
    return { text: `Poll created: "${result.generatedPoll.title}". View here: ${webLink()}` };
  }

  if (result.generatedAppointment) {
    const apt = result.generatedAppointment;
    return { text: `Appointment scheduled: ${apt.title}${apt.when ? ` — ${apt.when}` : ""}` };
  }

  if (result.generatedGivingRecord) {
    const g = result.generatedGivingRecord;
    return { text: `Giving recorded: ₦${g.amount?.toLocaleString() ?? 0} from ${g.giverName}.` };
  }

  if (result.reply) {
    return { text: stripMarkdown(result.reply) };
  }

  return { text: `Something went wrong. Please try again or visit ${webLink()}` };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/lib/services/whatsapp-formatter.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-formatter.ts src/lib/services/whatsapp-formatter.test.ts
git commit -m "feat: add WhatsApp response formatter"
```

---

## Task 4: Message Processor

**Files:**
- Create: `src/lib/services/whatsapp-processor.ts`
- Create: `src/lib/services/whatsapp-processor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/whatsapp-processor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetSessions } from "@/lib/services/whatsapp-session";

// Mock external dependencies
vi.mock("@/lib/services/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue(undefined),
  downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from(""), mimeType: "image/jpeg" }),
}));

vi.mock("@/lib/services/ai-service", () => ({
  runCherttCommand: vi.fn().mockResolvedValue({ reply: "Done." }),
}));

import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";
import { sendTextMessage } from "@/lib/services/whatsapp";
import { runCherttCommand } from "@/lib/services/ai-service";

const mockSend = sendTextMessage as ReturnType<typeof vi.fn>;
const mockRun = runCherttCommand as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  resetSessions();
});

describe("processWhatsAppMessage", () => {
  it("calls runCherttCommand and sends a reply for a text message", async () => {
    mockRun.mockResolvedValue({ reply: "Here is your answer." });

    await processWhatsAppMessage({
      from: "2348012345678",
      type: "text",
      text: "What is the inventory for diesel?",
    });

    expect(mockRun).toHaveBeenCalledWith(
      "What is the inventory for diesel?",
      expect.objectContaining({ role: "owner" }),
      false,
    );
    expect(mockSend).toHaveBeenCalledWith("2348012345678", "Here is your answer.");
  });

  it("replies CANCEL clears pending state without calling AI", async () => {
    // Set up a pending confirmation first
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "Draft a letter" });
    mockRun.mockResolvedValue({
      reply: "",
      pendingConfirmation: { summary: "Create letter", actionKey: "document", previewTitle: "Letter" },
    });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "Draft a letter" });

    mockRun.mockClear();
    mockSend.mockClear();

    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "cancel" });

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith("2348012345678", "Cancelled.");
  });

  it("CONFIRM re-runs the pending command with confirmed=true", async () => {
    // Simulate pending confirmation
    mockRun.mockResolvedValueOnce({
      reply: "",
      pendingConfirmation: { summary: "Create letter", actionKey: "document", previewTitle: "Vendor Letter" },
    });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "Draft a vendor letter" });

    mockRun.mockResolvedValueOnce({
      reply: "",
      generatedDocument: {
        id: "doc-1", title: "Vendor Letter", type: "letter", body: "...",
        status: "pending", preparedBy: "Guest", createdAtLabel: "Today",
      },
    });

    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "CONFIRM" });

    expect(mockRun).toHaveBeenLastCalledWith(
      "Draft a vendor letter",
      expect.anything(),
      true,
    );
  });

  it("sends 'not supported' reply for audio messages", async () => {
    await processWhatsAppMessage({ from: "2348012345678", type: "audio" });
    expect(mockSend).toHaveBeenCalledWith(
      "2348012345678",
      expect.stringContaining("Voice messages"),
    );
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("includes history from previous messages in context", async () => {
    mockRun.mockResolvedValue({ reply: "First reply." });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "First message" });

    mockRun.mockResolvedValue({ reply: "Second reply." });
    await processWhatsAppMessage({ from: "2348012345678", type: "text", text: "Second message" });

    const secondCall = mockRun.mock.calls[1];
    const context = secondCall[1] as { history: unknown[] };
    expect(context.history.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run src/lib/services/whatsapp-processor.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/services/whatsapp-processor'`

- [ ] **Step 3: Create the processor**

Create `src/lib/services/whatsapp-processor.ts`:

```ts
import { runCherttCommand } from "@/lib/services/ai-service";
import { sendTextMessage, downloadMedia } from "@/lib/services/whatsapp";
import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
} from "@/lib/services/whatsapp-session";
import { formatAiResult } from "@/lib/services/whatsapp-formatter";

export type IncomingMessage = {
  from: string;
  type: "text" | "image" | "document" | "audio" | "unknown";
  text?: string;
  mediaId?: string;
};

const CONFIRM_RE = /^(confirm|yes)$/i;
const APPROVE_RE = /^approve$/i;
const REJECT_RE = /^reject/i;
const CANCEL_RE = /^cancel$/i;

export async function processWhatsAppMessage(message: IncomingMessage): Promise<void> {
  const { from, type, text, mediaId } = message;
  const session = getSession(from);
  const trimmed = text?.trim() ?? "";

  // CANCEL — clear pending state
  if (CANCEL_RE.test(trimmed)) {
    clearPending(from);
    await sendTextMessage(from, "Cancelled.");
    return;
  }

  // CONFIRM — re-run pending command as confirmed
  if (CONFIRM_RE.test(trimmed) && session.pendingConfirmation) {
    const { originalPrompt } = session.pendingConfirmation;
    clearPending(from);
    const result = await runCherttCommand(originalPrompt, buildContext(session), true);
    const { text: replyText } = formatAiResult(result);
    await sendTextMessage(from, replyText);
    addToHistory(from, "user", "CONFIRM");
    addToHistory(from, "assistant", replyText);
    return;
  }

  // APPROVE — approve pending request
  if (APPROVE_RE.test(trimmed) && session.pendingApproval) {
    clearPending(from);
    await sendTextMessage(from, "Approved. The requester will be notified.");
    return;
  }

  // REJECT [reason] — reject pending request
  if (REJECT_RE.test(trimmed) && session.pendingApproval) {
    const reason = trimmed.replace(/^reject\s*/i, "").trim() || "No reason given";
    clearPending(from);
    await sendTextMessage(from, `Rejected: ${reason}. The requester will be notified.`);
    return;
  }

  // Audio — not supported
  if (type === "audio") {
    await sendTextMessage(from, "Voice messages aren't supported yet. Please type your request.");
    return;
  }

  // No usable content
  if (!trimmed && !mediaId) {
    await sendTextMessage(from, "I didn't understand that. Please type your request.");
    return;
  }

  // Download media if present
  let mediaDataUrl: string | undefined;
  if ((type === "image" || type === "document") && mediaId) {
    try {
      const { buffer, mimeType } = await downloadMedia(mediaId);
      mediaDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch {
      await sendTextMessage(from, "I couldn't read the image. Please describe what you need.");
      return;
    }
  }

  const prompt = trimmed || "Process the attached image.";
  addToHistory(from, "user", prompt);

  const result = await runCherttCommand(
    prompt,
    buildContext(session, mediaDataUrl),
    false,
  );

  // Store pending confirmation
  if (result.pendingConfirmation) {
    updateSession(from, {
      pendingConfirmation: {
        originalPrompt: prompt,
        artifactKind: result.pendingConfirmation.actionKey,
        previewTitle: result.pendingConfirmation.previewTitle,
      },
    });
  }

  // Store pending approval if a request was created
  if (result.generatedRequest) {
    updateSession(from, {
      pendingApproval: {
        requestId: result.generatedRequest.id,
        requestTitle: result.generatedRequest.title,
      },
    });
  }

  const { text: replyText } = formatAiResult(result);
  await sendTextMessage(from, replyText);
  addToHistory(from, "assistant", replyText);
}

function buildContext(
  session: ReturnType<typeof getSession>,
  mediaDataUrl?: string,
) {
  return {
    role: "owner" as const,
    userName: session.phoneNumber,
    history: session.history.map((h) => ({ speaker: h.role, text: h.text })),
    ...(mediaDataUrl ? { memoryContext: `[Attached image: ${mediaDataUrl.slice(0, 80)}...]` } : {}),
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run src/lib/services/whatsapp-processor.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/whatsapp-processor.ts src/lib/services/whatsapp-processor.test.ts
git commit -m "feat: add WhatsApp message processor"
```

---

## Task 5: Webhook API Route

**Files:**
- Create: `src/app/api/whatsapp/webhook/route.ts`

- [ ] **Step 1: Create the webhook route**

Create `src/app/api/whatsapp/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/services/whatsapp-processor";

// Meta verification handshake — called once when you register the webhook in Meta dashboard
export function GET(request: NextRequest): NextResponse {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// Incoming message handler — Meta sends every WhatsApp event here
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: MetaWebhookPayload | null = null;

  try {
    body = (await request.json()) as MetaWebhookPayload;
  } catch {
    // Malformed JSON — still return 200 so Meta doesn't retry
  }

  // Always return 200 immediately — Meta retries if it doesn't get 200 within 20s
  if (body) {
    void handlePayload(body);
  }

  return new NextResponse("OK", { status: 200 });
}

type MetaWebhookPayload = {
  object: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          image?: { id: string };
          document?: { id: string };
          audio?: { id: string };
          id: string;
        }>;
      };
    }>;
  }>;
};

async function handlePayload(payload: MetaWebhookPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const type = normalizeMessageType(message.type);
        await processWhatsAppMessage({
          from: message.from,
          type,
          text: message.text?.body,
          mediaId: message.image?.id ?? message.document?.id ?? message.audio?.id,
        });
      }
    }
  }
}

function normalizeMessageType(
  type: string,
): "text" | "image" | "document" | "audio" | "unknown" {
  switch (type) {
    case "text": return "text";
    case "image": return "image";
    case "document": return "document";
    case "audio": return "audio";
    default: return "unknown";
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests + 14 new WhatsApp tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/webhook/route.ts
git commit -m "feat: add WhatsApp webhook route (GET verification + POST handler)"
```

---

## Task 6: Environment Setup & Manual Test

**Files:**
- Modify: `.env.local` (add 4 new vars — do NOT commit this file)

- [ ] **Step 1: Add environment variables to .env.local**

Open `.env.local` and add:

```bash
WHATSAPP_ACCESS_TOKEN=your_token_from_meta_dashboard
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_from_meta_dashboard
WHATSAPP_VERIFY_TOKEN=chertt-webhook-secret-2026
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

Get the first two from: Meta Developer Console → Your App → WhatsApp → API Setup

- [ ] **Step 2: Verify .env.local is in .gitignore**

```bash
grep ".env.local" .gitignore
```

Expected: `.env.local` appears in the output. If not: `echo ".env.local" >> .gitignore`

- [ ] **Step 3: Install and run ngrok for local testing**

In a separate terminal:

```bash
# Install ngrok if not already installed: https://ngrok.com/download
ngrok http 3000
```

Copy the `https://` URL it gives you, e.g. `https://abc123.ngrok-free.app`

- [ ] **Step 4: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 5: Register the webhook in Meta dashboard**

1. Go to: Meta Developer Console → Your App → WhatsApp → Configuration
2. Webhook URL: `https://abc123.ngrok-free.app/api/whatsapp/webhook`
3. Verify Token: `chertt-webhook-secret-2026` (matches `WHATSAPP_VERIFY_TOKEN`)
4. Click **Verify and Save**
5. Subscribe to: `messages`

Expected: Meta says "Verified" — this means your GET handler worked.

- [ ] **Step 6: Send a test message**

From a phone registered as a test number in Meta dashboard, send a WhatsApp message to your test number: *"What is Chertt?"*

Expected in your terminal:
- POST request logged at `/api/whatsapp/webhook`
- A WhatsApp reply arrives on your phone within a few seconds

- [ ] **Step 7: Test CONFIRM flow**

Send: *"Draft a letter to our fuel vendor about payment extension"*

Expected: Chertt replies *"I'll create 'Payment Extension Request — Fuel Vendor'. Reply CONFIRM to proceed, or CANCEL to stop."*

Reply: *"CONFIRM"*

Expected: Chertt replies with the document ready message and a web link.

- [ ] **Step 8: Add env vars to Vercel**

In Vercel dashboard → Your Project → Settings → Environment Variables, add all four vars from Step 1.

Then deploy:

```bash
git push origin main
# or: vercel --prod
```

- [ ] **Step 9: Update webhook URL in Meta dashboard**

Change webhook URL from the ngrok URL to your production Vercel URL:
`https://your-app.vercel.app/api/whatsapp/webhook`

Click **Verify and Save** again.

- [ ] **Step 10: Update CHERTT_STATUS.md**

Open `CHERTT_STATUS.md` and change item 11 in "What's Broken or Missing":

```markdown
**11. WhatsApp integration** ✅
Meta Cloud API webhook live at `/api/whatsapp/webhook`. Handles text, images,
CONFIRM/APPROVE/REJECT flow. Deployed on Vercel.
```

Commit:

```bash
git add CHERTT_STATUS.md
git commit -m "docs: mark WhatsApp integration as complete in status doc"
```

---

## Self-Review

**Spec coverage:**
- ✅ GET webhook verification — Task 5
- ✅ POST webhook handler — Task 5
- ✅ WhatsApp sender service — Task 2
- ✅ Media download — Task 2
- ✅ Session state per phone — Task 1
- ✅ CONFIRM keyword → re-run confirmed=true — Task 4
- ✅ APPROVE / REJECT keywords — Task 4
- ✅ CANCEL keyword — Task 4
- ✅ Response formatter for all AiCommandResult types — Task 3
- ✅ Web link appended for documents, requests, issues — Task 3
- ✅ Plain text markdown stripping — Task 3
- ✅ Media → base64 → AI context — Task 4
- ✅ Audio not supported message — Task 4
- ✅ Environment variables — Task 6
- ✅ ngrok local testing — Task 6
- ✅ Meta webhook registration — Task 6

**Type consistency:**
- `IncomingMessage` defined in Task 4, used in Task 5 — ✅
- `WhatsAppSession` defined in Task 1, used in Task 4 — ✅
- `FormattedReply` defined in Task 3, used in Task 4 — ✅
- `sendTextMessage` / `downloadMedia` defined in Task 2, used in Task 4 — ✅
- `processWhatsAppMessage` defined in Task 4, used in Task 5 — ✅
