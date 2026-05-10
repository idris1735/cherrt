import { GoogleGenAI } from "@google/genai";
import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
  deductDemoBalance,
  type WhatsAppSession,
} from "@/lib/services/whatsapp-session";
import { sendTextMessage, sendInteractiveButtons, downloadMedia } from "@/lib/services/whatsapp";
import { runCherttCommand, type CommandExecutionContext } from "@/lib/services/ai-service";
import { formatAiResult } from "@/lib/services/whatsapp-formatter";
import {
  lookupPhoneLink,
  persistWorkspaceAiResult,
  getApproverPhone,
  approveWorkspaceRequest,
  rejectWorkspaceRequest,
  getWorkflowRequest,
  loadWorkspaceContext,
  type PhoneLink,
  type WorkspaceContext,
} from "@/lib/services/whatsapp-workspace";
import type { AiCommandResult } from "@/lib/types";

export type IncomingMessage = {
  from: string;
  type: "text" | "image" | "document" | "audio" | "interactive" | "unknown";
  text?: string;
  mediaId?: string;
  buttonReplyId?: string;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app";
const NAME_INTRO_RE = /^(?:i(?:'m| am)|my name is|call me)\s+([a-z][a-z\s'-]{1,30})/i;

function extractName(text: string): string | null {
  const m = text.trim().match(NAME_INTRO_RE);
  if (!m) return null;
  const raw = (m[1] ?? "").trim().split(/\s+/).slice(0, 3).join(" ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function fmt(n: number) {
  return "₦" + n.toLocaleString("en-NG");
}

// ─── Gemini Multimodal (voice + image) ───────────────────────────────────────

async function geminiMultimodal(
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  responseJson = false,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("No Gemini API key");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: responseJson
      ? { responseMimeType: "application/json", temperature: 0.1 }
      : { temperature: 0.1, maxOutputTokens: 600 },
  });
  return response.text?.trim() ?? "";
}

async function transcribeVoiceNote(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    const text = await geminiMultimodal([
      { inlineData: { mimeType, data: buffer.toString("base64") } },
      { text: "Transcribe this voice message exactly. Output only the transcription." },
    ]);
    return text || null;
  } catch {
    return null;
  }
}

type ReceiptInfo = { merchant: string; amount: number; items?: string };

async function extractReceiptInfo(buffer: Buffer, mimeType: string): Promise<ReceiptInfo | null> {
  try {
    const prompt = 'Is this a receipt, bill, or invoice? Return JSON only: { "isReceipt": true|false, "merchant": "...", "amount": 12345, "items": "brief summary" }. If not a receipt return { "isReceipt": false }.';
    const raw = await geminiMultimodal(
      [{ inlineData: { mimeType, data: buffer.toString("base64") } }, { text: prompt }],
      true,
    );
    const parsed = JSON.parse(raw) as { isReceipt: boolean; merchant: string; amount: number; items?: string };
    if (!parsed.isReceipt || !parsed.amount) return null;
    return { merchant: parsed.merchant || "Unknown merchant", amount: parsed.amount, items: parsed.items };
  } catch {
    return null;
  }
}

// ─── Welcome Messages ────────────────────────────────────────────────────────

function buildGuestWelcome(demoBalance: number): string {
  return [
    "*Welcome to Chertt!*",
    "",
    "You are connected as a *Guest* — try all features with a demo account.",
    "",
    "*Your demo includes:*",
    "• Demo balance: *" + fmt(demoBalance) + "*",
    "• AI that thinks like an ops lead, finance desk, and executive assistant",
    "• Full access to all Chertt features",
    "",
    "*Try saying:*",
    '_"Draft a payment request for ₦50,000 for office supplies"_',
    '_"Log an expense of ₦15,000 for transportation"_',
    '_"Report a broken AC in the conference room"_',
    '_"What can Chertt do?"_',
    "",
    "Ready for your own workspace? Sign up: " + APP_URL + "/auth/sign-in",
    "",
    "Go ahead — send your first request! 🚀",
  ].join("\n");
}

function buildWorkspaceWelcome(link: PhoneLink): string {
  const roleLabel = link.userRole === "owner" || link.userRole === "admin" ? "Admin" : "Team member";
  return [
    "*Welcome back, " + link.userName + "!*",
    "",
    "You are connected to *" + link.workspaceName + "* as " + roleLabel + ".",
    "",
    "Everything you do here is real — expenses, requests, and documents go straight into your workspace.",
    "",
    "*What you can do:*",
    "• Raise and approve requests",
    "• Log expenses (send a receipt photo to auto-log)",
    "• Draft letters, memos, and invoices",
    "• Report facility issues",
    "• Check inventory and the staff directory",
    "• Send a voice note — Chertt will understand it",
    "",
    "Type *status* anytime to see what is pending.",
  ].join("\n");
}

// ─── Context Builders ─────────────────────────────────────────────────────────

function buildGuestContext(session: WhatsAppSession, mediaDataUrl?: string): CommandExecutionContext {
  const name = session.userName ? "The user name is " + session.userName + "." : "The user has not shared their name yet.";
  const parts = [
    "Channel: WhatsApp. User is in guest/demo mode.",
    "User status: Guest. Treat as owner-level for demo purposes.",
    name,
    "Demo balance: " + fmt(session.demoBalance) + " remaining. Mention the updated balance after any expense or request with an amount.",
    "If user is chatting casually respond warmly. Do NOT create artifacts for casual conversation.",
    "Encourage sign-up occasionally: " + APP_URL + "/auth/sign-in",
  ];
  if (mediaDataUrl) parts.push("Attached media: " + mediaDataUrl);
  return {
    role: "owner",
    userName: session.userName,
    history: session.history.map((h) => ({ speaker: h.role === "user" ? "user" : "assistant", text: h.text })),
    memoryContext: parts.join(" "),
  };
}

function buildWorkspaceCtx(
  link: PhoneLink,
  ctx: WorkspaceContext,
  session: WhatsAppSession,
  mediaDataUrl?: string,
): CommandExecutionContext {
  const parts: string[] = [
    "Channel: WhatsApp. Workspace: " + link.workspaceName + ". User: " + link.userName + " (" + link.userRole + ").",
    "All actions create REAL records in the workspace.",
  ];
  if (ctx.pendingRequests.length) {
    parts.push("Pending requests (" + ctx.pendingRequests.length + "): " + ctx.pendingRequests.map((r) => '"' + r.title + '"' + (r.amount ? " " + fmt(r.amount) : "") + " by " + r.requester).join("; ") + ".");
  }
  if (ctx.recentExpenses.length) {
    parts.push("Recent expenses: " + ctx.recentExpenses.map((e) => e.title + " " + fmt(e.amount)).join(", ") + ".");
  }
  if (ctx.lowInventoryItems.length) {
    parts.push("Low inventory: " + ctx.lowInventoryItems.map((i) => i.name + " (" + i.inStock + " left)").join(", ") + ".");
  }
  if (ctx.pendingIssues.length) {
    parts.push("Open issues: " + ctx.pendingIssues.map((i) => i.title + " [" + i.severity + "]").join(", ") + ".");
  }
  if (mediaDataUrl) parts.push("Attached media: " + mediaDataUrl);
  const role = link.userRole === "owner" || link.userRole === "admin" ? "owner" : "operations";
  return {
    role,
    userName: link.userName,
    history: session.history.map((h) => ({ speaker: h.role === "user" ? "user" : "assistant", text: h.text })),
    memoryContext: parts.join(" "),
  };
}

// ─── Status Dashboard ─────────────────────────────────────────────────────────

async function handleStatusCommand(from: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  if (link) {
    const ctx = await loadWorkspaceContext(link.workspaceId);
    const lines = ["*" + link.workspaceName + " — Your Status*", ""];
    if (ctx.pendingRequests.length) {
      lines.push("*Pending requests (" + ctx.pendingRequests.length + ")*");
      for (const r of ctx.pendingRequests) {
        lines.push("• " + r.title + (r.amount ? " — " + fmt(r.amount) : "") + " _(" + r.requester + ")_");
      }
      lines.push("");
    } else { lines.push("No pending requests"); lines.push(""); }
    if (ctx.recentExpenses.length) {
      lines.push("*Recent expenses*");
      for (const e of ctx.recentExpenses) lines.push("• " + e.title + " — " + fmt(e.amount));
      lines.push("");
    }
    if (ctx.lowInventoryItems.length) {
      lines.push("*Low inventory*");
      for (const i of ctx.lowInventoryItems) lines.push("• " + i.name + " — " + i.inStock + " remaining");
      lines.push("");
    }
    if (ctx.pendingIssues.length) {
      lines.push("*Open issues (" + ctx.pendingIssues.length + ")*");
      for (const i of ctx.pendingIssues) lines.push("• " + i.title + " [" + i.severity + "]");
      lines.push("");
    }
    if (!ctx.pendingRequests.length && !ctx.recentExpenses.length && !ctx.pendingIssues.length) {
      lines.push("Everything is clear — no pending items.");
    }
    lines.push("_Type a command or ask anything_");
    await sendTextMessage(from, lines.join("\n"));
  } else {
    await sendTextMessage(from, ["*Your Demo Status*", "", "Demo balance: *" + fmt(session.demoBalance) + "*", "", "You are in guest mode. Sign up to connect a real workspace:", APP_URL + "/auth/sign-in"].join("\n"));
  }
}

// ─── AI Result Handler ────────────────────────────────────────────────────────

async function handleAiResult(
  from: string,
  result: AiCommandResult,
  prompt: string,
  session: WhatsAppSession,
  link: PhoneLink | null,
): Promise<void> {
  if (result.pendingConfirmation) {
    const { previewTitle } = result.pendingConfirmation;
    const bodyText = 'I will create *"' + previewTitle + '"*.\n\nTap to confirm or cancel:';
    await updateSession(from, {
      pendingConfirmation: { originalPrompt: prompt, artifactKind: result.pendingConfirmation.actionKey ?? "", previewTitle },
    });
    try {
      await sendInteractiveButtons(from, bodyText, [{ id: "confirm", title: "Confirm" }, { id: "cancel", title: "Cancel" }]);
    } catch {
      await sendTextMessage(from, bodyText + "\n\nReply *CONFIRM* to proceed or *CANCEL* to stop.");
    }
    await addToHistory(from, "assistant", 'Pending confirmation: "' + previewTitle + '"');
    return;
  }

  if (link) {
    await persistWorkspaceAiResult(link.workspaceId, link.userName, result);
  } else {
    const amount = result.generatedExpenseEntry?.amount ?? result.generatedRequest?.amount;
    if (amount) await deductDemoBalance(from, amount);
  }

  if (result.generatedRequest) {
    await updateSession(from, {
      pendingApproval: { requestId: result.generatedRequest.id, requestTitle: result.generatedRequest.title },
    });
  }

  if (result.generatedRequest && link) {
    const approverPhone = await getApproverPhone(link.workspaceId);
    if (approverPhone && approverPhone !== from) {
      const amount = result.generatedRequest.amount;
      const body = ["*New Request from " + link.userName + "*", "", "*" + result.generatedRequest.title + "*", amount ? "Amount: " + fmt(amount) : null, result.generatedRequest.description ? "\n" + result.generatedRequest.description : null].filter(Boolean).join("\n");
      await updateSession(approverPhone, {
        pendingApproval: { requestId: result.generatedRequest.id, requestTitle: result.generatedRequest.title, requesterPhone: from },
      });
      try {
        await sendInteractiveButtons(approverPhone, body, [
          { id: "approve_" + result.generatedRequest.id, title: "Approve" },
          { id: "reject_" + result.generatedRequest.id, title: "Reject" },
        ], link.workspaceName);
      } catch {
        await sendTextMessage(approverPhone, body + "\n\nReply *APPROVE* or *REJECT* to decide.");
      }
    }
  }

  const freshSession = await getSession(from);
  const replyText = formatAiResult(result, freshSession, link).text || "Something went wrong. Please try again.";
  await sendTextMessage(from, replyText);
  await addToHistory(from, "assistant", replyText);
}

// ─── Confirm / Button Handlers ────────────────────────────────────────────────

async function handleConfirm(from: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  if (!session.pendingConfirmation) return;
  const { originalPrompt } = session.pendingConfirmation;
  await clearPending(from);
  const freshSession = await getSession(from);
  let context: CommandExecutionContext;
  if (link) { const ctx = await loadWorkspaceContext(link.workspaceId); context = buildWorkspaceCtx(link, ctx, freshSession); }
  else { context = buildGuestContext(freshSession); }
  const result = await runCherttCommand(originalPrompt, context, true);
  await handleAiResult(from, result, originalPrompt, freshSession, link);
}

async function handleButtonReply(from: string, buttonId: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  if (buttonId === "confirm") { await handleConfirm(from, session, link); return; }
  if (buttonId === "cancel") { await clearPending(from); await sendTextMessage(from, "Cancelled. What else can I help you with?"); return; }

  if (buttonId.startsWith("approve_")) {
    const requestId = buttonId.slice(8);
    const [request] = await Promise.all([getWorkflowRequest(requestId), approveWorkspaceRequest(requestId)]);
    await sendTextMessage(from, '✅ Approved: "' + (request?.title ?? "Request") + '"\n\nThe requester has been notified.');
    const rp = session.pendingApproval?.requesterPhone;
    if (rp && request) { const amt = request.amount ? " (" + fmt(request.amount) + ")" : ""; await sendTextMessage(rp, '🎉 Your request "' + request.title + '"' + amt + " has been approved!"); }
    await clearPending(from); return;
  }

  if (buttonId.startsWith("reject_")) {
    const requestId = buttonId.slice(7);
    const [request] = await Promise.all([getWorkflowRequest(requestId), rejectWorkspaceRequest(requestId)]);
    await sendTextMessage(from, '❌ Rejected: "' + (request?.title ?? "Request") + '"');
    const rp = session.pendingApproval?.requesterPhone;
    if (rp) { await sendTextMessage(rp, '❌ Your request "' + (request?.title ?? "your request") + '" was not approved. Contact your manager for details.'); }
    await clearPending(from); return;
  }

  await sendTextMessage(from, "I did not recognize that action. Please try again.");
}

// ─── Voice & Receipt ──────────────────────────────────────────────────────────

async function handleVoiceNote(from: string, mediaId: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  let buffer: Buffer; let mimeType: string;
  try { ({ buffer, mimeType } = await downloadMedia(mediaId)); }
  catch { await sendTextMessage(from, "Could not download that voice note. Please type your request."); return; }
  const transcript = await transcribeVoiceNote(buffer, mimeType);
  if (!transcript) { await sendTextMessage(from, "Could not make out that voice note. Please try again or type your message."); return; }
  const display = transcript.length > 120 ? transcript.slice(0, 120) + "..." : transcript;
  await addToHistory(from, "user", "[Voice] " + display);
  const freshSession = await getSession(from);
  let context: CommandExecutionContext;
  if (link) { const ctx = await loadWorkspaceContext(link.workspaceId); context = buildWorkspaceCtx(link, ctx, freshSession); }
  else { context = buildGuestContext(freshSession); }
  const result = await runCherttCommand(transcript, context, false);
  await handleAiResult(from, result, transcript, freshSession, link);
}

async function handleReceiptImage(from: string, receipt: ReceiptInfo, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  const { merchant, amount, items } = receipt;
  const description = items ? merchant + " - " + items : merchant;
  if (link) {
    await persistWorkspaceAiResult(link.workspaceId, link.userName, {
      reply: "",
      generatedExpenseEntry: { id: crypto.randomUUID(), title: description, department: "General", amount, receiptCount: 1, status: "pending" },
    });
    const lines = ["🧾 *Receipt scanned*", "", "• Merchant: " + merchant, "• Amount: *" + fmt(amount) + "*", items ? "• Items: " + items : null, "", "✅ Logged to your workspace expenses."].filter(Boolean);
    await sendTextMessage(from, lines.join("\n"));
  } else {
    await deductDemoBalance(from, amount);
    const freshSession = await getSession(from);
    const lines = ["🧾 *Receipt scanned*", "", "• Merchant: " + merchant, "• Amount: *" + fmt(amount) + "*", items ? "• Items: " + items : null, "", "✅ Expense logged.", "💰 Demo balance: *" + fmt(freshSession.demoBalance) + "* remaining"].filter(Boolean);
    await sendTextMessage(from, lines.join("\n"));
  }
  await addToHistory(from, "user", "[Receipt] " + merchant + " " + fmt(amount));
  await addToHistory(from, "assistant", "Logged expense: " + fmt(amount) + " at " + merchant);
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function processWhatsAppMessage(message: IncomingMessage): Promise<void> {
  const { from, type } = message;
  const [session, link] = await Promise.all([getSession(from), lookupPhoneLink(from)]);
  const trimmed = (message.text ?? "").trim();

  if (!session.welcomed) {
    await updateSession(from, { welcomed: true });
    await sendTextMessage(from, link ? buildWorkspaceWelcome(link) : buildGuestWelcome(session.demoBalance));
    return;
  }

  if (type === "interactive" && message.buttonReplyId) { await handleButtonReply(from, message.buttonReplyId, session, link); return; }

  if (trimmed && !session.userName && !link) { const name = extractName(trimmed); if (name) await updateSession(from, { userName: name }); }

  if (/^cancel$/i.test(trimmed)) { await clearPending(from); await sendTextMessage(from, "Cancelled. What else can I help you with?"); return; }
  if (/^(confirm|yes)$/i.test(trimmed) && session.pendingConfirmation) { await handleConfirm(from, session, link); return; }

  if (/^approve$/i.test(trimmed) && session.pendingApproval) {
    const requestId = session.pendingApproval.requestId;
    const [request] = await Promise.all([getWorkflowRequest(requestId), approveWorkspaceRequest(requestId)]);
    await sendTextMessage(from, '✅ Approved: "' + (request?.title ?? session.pendingApproval.requestTitle) + '"');
    const rp = session.pendingApproval.requesterPhone;
    if (rp && request) { const amt = request.amount ? " (" + fmt(request.amount) + ")" : ""; await sendTextMessage(rp, '🎉 Your request "' + request.title + '"' + amt + " has been approved!"); }
    await clearPending(from); return;
  }

  if (/^reject\b/i.test(trimmed) && session.pendingApproval) {
    const reason = trimmed.replace(/^reject\s*/i, "").trim();
    const requestId = session.pendingApproval.requestId;
    const [request] = await Promise.all([getWorkflowRequest(requestId), rejectWorkspaceRequest(requestId)]);
    const msg = reason ? '❌ Rejected: "' + (request?.title ?? session.pendingApproval.requestTitle) + '". Reason: ' + reason : '❌ Rejected: "' + (request?.title ?? session.pendingApproval.requestTitle) + '"';
    await sendTextMessage(from, msg);
    const rp = session.pendingApproval.requesterPhone;
    if (rp) { await sendTextMessage(rp, '❌ Your request "' + (request?.title ?? "your request") + '" was not approved.' + (reason ? "\n\nReason: " + reason : "")); }
    await clearPending(from); return;
  }

  if (/^(status|my status|show status|dashboard|summary)$/i.test(trimmed)) { await handleStatusCommand(from, session, link); return; }

  if (type === "audio") {
    if (message.mediaId) { await handleVoiceNote(from, message.mediaId, session, link); }
    else { await sendTextMessage(from, "Could not download that voice note. Please type your request."); }
    return;
  }

  if (!trimmed && !message.mediaId) { await sendTextMessage(from, "I did not catch that. Please type your request or send an image."); return; }

  if (type === "image" && message.mediaId) {
    let buffer: Buffer; let mimeType: string;
    try { ({ buffer, mimeType } = await downloadMedia(message.mediaId)); }
    catch { await sendTextMessage(from, "Could not download that image. Please try again."); return; }
    const receipt = await extractReceiptInfo(buffer, mimeType);
    if (receipt) { await handleReceiptImage(from, receipt, session, link); return; }
    const mediaDataUrl = "data:" + mimeType + ";base64," + buffer.toString("base64");
    const prompt = trimmed || "[image]";
    await addToHistory(from, "user", prompt);
    const freshSession = await getSession(from);
    let context: CommandExecutionContext;
    if (link) { const ctx = await loadWorkspaceContext(link.workspaceId); context = buildWorkspaceCtx(link, ctx, freshSession, mediaDataUrl); }
    else { context = buildGuestContext(freshSession, mediaDataUrl); }
    const result = await runCherttCommand(prompt, context, false);
    await handleAiResult(from, result, prompt, freshSession, link);
    return;
  }

  if (type === "document" && message.mediaId) {
    let buffer: Buffer; let mimeType: string;
    try { ({ buffer, mimeType } = await downloadMedia(message.mediaId)); }
    catch { await sendTextMessage(from, "Could not download that file. Please try again."); return; }
    const mediaDataUrl = "data:" + mimeType + ";base64," + buffer.toString("base64");
    const prompt = trimmed || "[document attachment]";
    await addToHistory(from, "user", prompt);
    const freshSession = await getSession(from);
    let context: CommandExecutionContext;
    if (link) { const ctx = await loadWorkspaceContext(link.workspaceId); context = buildWorkspaceCtx(link, ctx, freshSession, mediaDataUrl); }
    else { context = buildGuestContext(freshSession, mediaDataUrl); }
    const result = await runCherttCommand(prompt, context, false);
    await handleAiResult(from, result, prompt, freshSession, link);
    return;
  }

  if (trimmed) {
    await addToHistory(from, "user", trimmed);
    const freshSession = await getSession(from);
    let context: CommandExecutionContext;
    if (link) { const ctx = await loadWorkspaceContext(link.workspaceId); context = buildWorkspaceCtx(link, ctx, freshSession); }
    else { context = buildGuestContext(freshSession); }
    const result = await runCherttCommand(trimmed, context, false);
    await handleAiResult(from, result, trimmed, freshSession, link);
  }
}