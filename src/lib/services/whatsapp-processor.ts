import { GoogleGenAI } from "@google/genai";
import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
  deductDemoBalance,
  type WhatsAppSession,
} from "@/lib/services/whatsapp-session";
import { sendTextMessage, sendInteractiveButtons, sendInteractiveList, downloadMedia } from "@/lib/services/whatsapp";
import { sendOrgApprovedTemplate, sendOrgRejectedTemplate } from "@/lib/services/whatsapp-templates";
import { runCherttCommand, type CommandExecutionContext } from "@/lib/services/ai-service";
import { formatAiResult } from "@/lib/services/whatsapp-formatter";
import {
  lookupAllPhoneLinks,
  resolveActivePhoneLink,
  persistWorkspaceAiResult,
  getApproverPhone,
  approveWorkspaceRequest,
  rejectWorkspaceRequest,
  getWorkflowRequest,
  loadWorkspaceContext,
  loadKnowledgeContext,
  claimWhatsAppMessage,
  getGivingSummary,
  getOrganizationWorkspaces,
  isPlatformAdmin,
  approveOrganization,
  rejectOrganization,
  findWorkspaceByJoinCode,
  claimBranchAdmin,
  type PhoneLink,
  type WorkspaceContext,
} from "@/lib/services/whatsapp-workspace";
import { provisionPersonMembership } from "@/lib/services/identity/provisioning";
import { resolveIdentityByPhone, pickActiveMembership } from "@/lib/services/identity/resolver";
import { isAssignRoleTrigger, startAssignRoleFlow, advanceAssignRoleFlow } from "@/lib/services/identity/assign-role-flow";
import { canAssignRole, roleRank } from "@/lib/services/identity/role-catalog";
import { runAgentQuery, getAgentTool, type MediaPart } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import { recordToolAudit } from "@/lib/services/agent/audit";
import type { AgentContext } from "@/lib/services/agent/tools";
import type { Role } from "@/lib/types";
import {
  isSignupTrigger,
  startSignupFlow,
  advanceSignupFlow,
  cancelOnboardingFlow,
  startSetupFlow,
  advanceSetupFlow,
} from "@/lib/services/onboarding-flow";
import { buildKnowledgeContextString, demoKnowledgeArticles } from "@/lib/data/knowledge";
import {
  matchReportIntent,
  buildReport,
  matchOrgReportIntent,
  buildOrgOverviewReport,
  buildOrgGivingReport,
  type OrgReportKey,
} from "@/lib/services/whatsapp-reports";
import { loadWorkspaceData } from "@/lib/services/workspace-data";
import { computeMetrics } from "@/lib/services/business-metrics";
import type { AiCommandResult } from "@/lib/types";

export type IncomingMessage = {
  messageId?: string;
  from: string;
  type: "text" | "image" | "document" | "audio" | "interactive" | "unknown";
  text?: string;
  mediaId?: string;
  buttonReplyId?: string;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app";
const NAME_INTRO_RE = /^(?:i(?:'m| am)|my name is|call me)\s+([a-z][a-z\s'-]{1,30})/i;
const GREETING_ONLY_RE = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|start|menu)$/i;
const HELP_RE = /^(?:help|help me|i need help|need help|pls help|please help|can (?:you|u) help(?: me)?|abeg(?: help(?: me)?)?|wetin i go do|i no (?:understand|sabi|know)|i dey (?:confused|lost)|menu|commands?|options?|start over|guide me|what can (?:you|u|chertt) do|how (?:do|can) i use (?:this|chertt)|i(?:'m| am)? (?:lost|confused|stuck)(?: .*)?|i don'?t (?:know|understand)(?: .*)?|not sure(?: .*)?)$/i;

function extractName(text: string): string | null {
  const m = text.trim().match(NAME_INTRO_RE);
  if (!m) return null;
  const raw = (m[1] ?? "").trim().split(/\s+/).slice(0, 3).join(" ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function fmt(n: number) {
  return "₦" + n.toLocaleString("en-NG");
}

function shouldStopAfterWelcome(message: IncomingMessage, text: string) {
  if (message.buttonReplyId || message.mediaId) return false;
  if (!text) return true;
  return GREETING_ONLY_RE.test(text);
}

function buildHelpText(link: PhoneLink | null, session: WhatsAppSession): string {
  const name = link?.userName || session.userName;
  return [
    name ? "*" + name + ", here is the simple menu.*" : "*Here is the simple menu.*",
    "",
    "Just send a normal message. Chertt will turn it into the right workflow.",
    "",
    "*Try any of these:*",
    "1. *Request* - \"Request ₦85,000 for diesel\"",
    "2. *Expense* - \"Log ₦15,000 transport expense\" or send a receipt photo",
    "3. *Issue* - \"Report broken AC in reception\"",
    "4. *Document* - \"Draft a letter to the landlord about rent\"",
    "5. *Find info* - \"What is the process for office supplies?\"",
    "",
    "You can also send a voice note or photo. Type *status* to see pending work.",
  ].join("\n");
}

async function sendHelpMenu(from: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  const text = buildHelpText(link, session);
  try {
    await sendInteractiveButtons(from, text, [
      { id: "help_request", title: "Request" },
      { id: "help_expense", title: "Expense" },
      { id: "help_issue", title: "Issue" },
    ], "Chertt menu");
  } catch {
    await sendTextMessage(from, text);
  }
  await addToHistory(from, "assistant", "Sent simple WhatsApp help menu");
}

async function handleHelpButton(from: string, buttonId: string): Promise<boolean> {
  const guides: Record<string, string> = {
    help_request: [
      "*Request format*",
      "",
      "Reply like this:",
      "\"Request ₦85,000 for diesel because the generator is low\"",
      "",
      "If you do not know the amount, say:",
      "\"Request diesel for the generator\"",
    ].join("\n"),
    help_expense: [
      "*Expense format*",
      "",
      "Reply like this:",
      "\"Log ₦15,000 transport expense for Admin\"",
      "",
      "Or just send a receipt photo and Chertt will read it.",
    ].join("\n"),
    help_issue: [
      "*Issue format*",
      "",
      "Reply like this:",
      "\"Report broken AC in reception, urgent\"",
      "",
      "You can attach a photo or short video if it helps explain the problem.",
    ].join("\n"),
  };
  const guide = guides[buttonId];
  if (!guide) return false;
  await sendTextMessage(from, guide);
  await addToHistory(from, "assistant", guide);
  return true;
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

function buildGuestContext(
  session: WhatsAppSession,
  mediaAttachment?: { mimeType: string; data: string },
): CommandExecutionContext {
  const name = session.userName ? "The user name is " + session.userName + "." : "The user has not shared their name yet.";
  const parts = [
    "Channel: WhatsApp. User is in guest/demo mode.",
    "User status: Guest. Treat as owner-level for demo purposes.",
    name,
    "Demo balance: " + fmt(session.demoBalance) + " remaining. Mention the updated balance after any expense or request with an amount.",
    "If user is chatting casually respond warmly. Do NOT create artifacts for casual conversation.",
    "Assume WhatsApp users may be non-technical. If the request is vague, ask one simple question or offer 2-3 concrete examples instead of sounding clever.",
    "Nigerian Pidgin English is common — understand it and respond warmly in Pidgin if that is what the user uses. Also accept Yoruba, Hausa, or Igbo phrases mixed in and respond helpfully.",
    "Encourage sign-up occasionally: " + APP_URL + "/auth/sign-in",
  ];
  if (mediaAttachment) parts.push("Attached media is provided to Gemini as inlineData. Inspect it before creating the record.");
  const knowledgeContext = buildKnowledgeContextString(demoKnowledgeArticles);
  return {
    role: "owner",
    userName: session.userName,
    history: session.history.map((h) => ({ speaker: h.role === "user" ? "user" : "assistant", text: h.text })),
    mediaAttachments: mediaAttachment ? [mediaAttachment] : undefined,
    memoryContext: parts.join(" ") + "\n\n" + knowledgeContext,
  };
}

function buildWorkspaceCtx(
  link: PhoneLink,
  ctx: WorkspaceContext,
  session: WhatsAppSession,
  mediaAttachment?: { mimeType: string; data: string },
  knowledgeStr?: string,
): CommandExecutionContext {
  const parts: string[] = [
    "Channel: WhatsApp. Workspace: " + link.workspaceName + ". User: " + link.userName + " (" + link.userRole + ").",
    "All actions create REAL records in the workspace.",
    "Assume this WhatsApp user may be non-technical. Be explicit, forgiving of typos, and ask one simple question when details are missing.",
    "Nigerian Pidgin English is common — understand it and respond warmly in Pidgin if that is what the user uses. Also accept Yoruba, Hausa, or Igbo phrases mixed in.",
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
  if (ctx.givingCategories?.length) {
    parts.push("This church's giving categories: " + ctx.givingCategories.join(", ") + ". If someone names one of these, mention it back to them naturally, but still set givingType to the closest of tithe/offering/donation/pledge.");
  }
  if (ctx.ministryUnits?.length) {
    parts.push("This church's ministry units: " + ctx.ministryUnits.join(", ") + ". Use one of these exact names for directoryUnit when adding a person, if their role fits one.");
  }
  if (mediaAttachment) parts.push("Attached media is provided to Gemini as inlineData. Inspect it before creating the record.");
  const role = link.userRole === "owner" || link.userRole === "admin" ? "owner" : "operations";
  return {
    role,
    userName: link.userName,
    history: session.history.map((h) => ({ speaker: h.role === "user" ? "user" : "assistant", text: h.text })),
    mediaAttachments: mediaAttachment ? [mediaAttachment] : undefined,
    memoryContext: parts.join(" ") + (knowledgeStr ? "\n\n" + knowledgeStr : ""),
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

  let approvalDeliveryNote = "";

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
      approvalDeliveryNote = "\n\n✅ Approver notified on WhatsApp.";
    } else if (approverPhone === from) {
      approvalDeliveryNote = "\n\n⚠️ You are currently the linked approver for this workspace, so Chertt saved it to the approval queue for in-app review.";
    } else {
      approvalDeliveryNote = "\n\n⚠️ No approver WhatsApp number is linked yet. The request is saved, but an admin should link an approver in Settings before the demo approval flow.";
    }
  }

  const freshSession = await getSession(from);

  // Polls: send as native interactive message so voting happens in WhatsApp, not a web link
  if (result.generatedPoll && result.generatedPoll.options.length > 0) {
    const { id, title, options } = result.generatedPoll;
    const votes: Record<string, number> = {};
    for (const o of options) votes[o] = 0;
    await updateSession(from, { activePoll: { id, title, options, votes } });
    const preamble = `📊 *Poll*\n\n*${title}*\n\nTap your answer:`;
    const pollButtons = options.map((o, i) => ({ id: `poll-vote:${i}`, title: o.slice(0, 20) }));
    try {
      if (options.length <= 3) {
        await sendInteractiveButtons(from, preamble, pollButtons, "New poll");
      } else {
        await sendInteractiveList(from, preamble, "Vote",
          options.map((o, i) => ({ id: `poll-vote:${i}`, title: o })),
          "New poll",
        );
      }
    } catch {
      const optList = options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      await sendTextMessage(from, `📊 *Poll created*\n\n*${title}*\n\nOptions:\n${optList}\n\nReply with the number of your choice.`);
    }
    await addToHistory(from, "assistant", `Poll: ${title} — ${options.join(", ")}`);
    await updateSession(from, { clarificationStreak: 0 });
    return;
  }

  const replyText = (formatAiResult(result, freshSession, link).text || "Something went wrong. Please try again.") + approvalDeliveryNote;
  await sendTextMessage(from, replyText);
  await addToHistory(from, "assistant", replyText);

  // Circuit breaker — after 3 consecutive non-actionable AI replies, show the help menu
  const hasArtifact = !!(
    result.pendingConfirmation || result.generatedRequest || result.generatedDocument ||
    result.generatedExpenseEntry || result.generatedIssueReport || result.generatedInventoryItem ||
    result.generatedAppointment || result.generatedPoll || result.generatedForm ||
    result.generatedPaymentLink || result.generatedPerson || result.generatedGivingRecord
  );
  if (hasArtifact) {
    await updateSession(from, { clarificationStreak: 0 });
  } else {
    const streak = (freshSession.clarificationStreak ?? 0) + 1;
    if (streak >= 3) {
      await updateSession(from, { clarificationStreak: 0 });
      const latestSession = await getSession(from);
      await sendHelpMenu(from, latestSession, link);
    } else {
      await updateSession(from, { clarificationStreak: streak });
    }
  }
}

// ─── Confirm / Button Handlers ────────────────────────────────────────────────

async function handleConfirm(from: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  if (!session.pendingConfirmation) return;
  const { originalPrompt } = session.pendingConfirmation;
  await clearPending(from);
  const freshSession = await getSession(from);
  let context: CommandExecutionContext;
  if (link) { const [ctx, kb] = await Promise.all([loadWorkspaceContext(link.workspaceId), loadKnowledgeContext(link.workspaceId)]); context = buildWorkspaceCtx(link, ctx, freshSession, undefined, kb); }
  else { context = buildGuestContext(freshSession); }
  const result = await runCherttCommand(originalPrompt, context, true);
  await handleAiResult(from, result, originalPrompt, freshSession, link);
}

async function buildOrgWideReport(
  orgReportKey: OrgReportKey,
  from: string,
): Promise<{ text: string; buttons?: Array<{ id: string; title: string }> }> {
  const branches = await getOrganizationWorkspaces(from).catch(() => []);
  if (!branches.length) {
    return { text: "This is for organization admins overseeing more than one branch." };
  }

  if (orgReportKey === "org-giving") {
    const perBranch = await Promise.all(
      branches.map(async (b) => ({
        id: b.id,
        name: b.name,
        givingSummary: await getGivingSummary(b.id).catch(() => undefined),
      })),
    );
    return buildOrgGivingReport(perBranch);
  }

  const perBranch = await Promise.all(
    branches.map(async (b) => {
      const data = await loadWorkspaceData(b.id).catch(() => undefined);
      return { id: b.id, name: b.name, metrics: data ? computeMetrics(data, "month") : undefined };
    }),
  );
  return buildOrgOverviewReport(perBranch);
}

async function handleButtonReply(from: string, buttonId: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  if (await handleHelpButton(from, buttonId)) return;
  if (buttonId === "confirm") { await handleConfirm(from, session, link); return; }
  if (buttonId === "cancel") { await clearPending(from); await sendTextMessage(from, "Cancelled. What else can I help you with?"); return; }

  // ── Org-wide report navigation buttons ──
  if (buttonId === "rpt:org-overview" || buttonId === "rpt:org-giving") {
    const orgReportKey = buttonId.slice(4) as OrgReportKey;
    const { text, buttons } = await buildOrgWideReport(orgReportKey, from);
    if (buttons?.length) {
      try { await sendInteractiveButtons(from, text, buttons); }
      catch { await sendTextMessage(from, text); }
    } else {
      await sendTextMessage(from, text);
    }
    return;
  }

  // ── Report navigation buttons ──
  if (buttonId.startsWith("rpt:")) {
    const key = buttonId.slice(4) as "overview" | "customers" | "sales" | "expenses" | "requests" | "inventory" | "wallet" | "issues" | "giving";
    const [workspaceContext, liveData, givingSummary] = link
      ? await Promise.all([
          loadWorkspaceContext(link.workspaceId),
          loadWorkspaceData(link.workspaceId).catch(() => undefined),
          key === "giving" ? getGivingSummary(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
        ])
      : [undefined, undefined, undefined];
    const { text, buttons } = await buildReport(key, { link, session, workspaceContext, liveData, givingSummary });
    if (buttons?.length) {
      try { await sendInteractiveButtons(from, text, buttons); }
      catch { await sendTextMessage(from, text); }
    } else {
      await sendTextMessage(from, text);
    }
    return;
  }

  if (buttonId.startsWith("poll-vote:")) {
    const optionIndex = parseInt(buttonId.split(":")[1] ?? "0", 10);
    const currentSession = await getSession(from);
    if (currentSession.activePoll) {
      const { title, options, votes } = currentSession.activePoll;
      const chosen = options[optionIndex] ?? options[0];
      const newVotes = { ...votes, [chosen]: (votes[chosen] ?? 0) + 1 };
      await updateSession(from, { activePoll: { ...currentSession.activePoll, votes: newVotes } });
      const tally = options.map((o) => `• ${o}: ${newVotes[o] ?? 0}`).join("\n");
      await sendTextMessage(from, `✅ Vote recorded: *${chosen}*\n\n📊 *${title}*\n${tally}`);
    } else {
      await sendTextMessage(from, "✅ Vote recorded!");
    }
    return;
  }

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

async function handleVoiceNote(from: string, mediaId: string, session: WhatsAppSession, link: PhoneLink | null, personId?: string): Promise<void> {
  let buffer: Buffer; let mimeType: string;
  try { ({ buffer, mimeType } = await downloadMedia(mediaId)); }
  catch { await sendTextMessage(from, "Could not download that voice note. Please type your request."); return; }
  const transcript = await transcribeVoiceNote(buffer, mimeType);
  if (!transcript) { await sendTextMessage(from, "Could not make out that voice note. Please try again or type your message."); return; }

  // Linked users: hand the transcript to the agent (its history capture covers
  // the message). Falls through to the creator when the agent is unavailable.
  if (link) {
    if (await dispatchToAgent(from, transcript, agentCtx(link, from, personId))) return;
  }

  const display = transcript.length > 120 ? transcript.slice(0, 120) + "..." : transcript;
  await addToHistory(from, "user", "[Voice] " + display);
  const freshSession = await getSession(from);
  let context: CommandExecutionContext;
  if (link) { const [ctx, kb] = await Promise.all([loadWorkspaceContext(link.workspaceId), loadKnowledgeContext(link.workspaceId)]); context = buildWorkspaceCtx(link, ctx, freshSession, undefined, kb); }
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
      generatedExpenseEntry: { id: crypto.randomUUID(), title: description, department: "General", amount, receiptCount: 1, status: "pending", attachments: [] },
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

// Resolves the sender's branch links using the person-centric identity model
// first, falling back to the legacy whatsapp_phone_links table when the new
// model has nothing for this phone yet. Safe to run before or after the
// migration is applied: pre-migration the resolver returns nothing and the
// legacy path is used; post-migration (with backfill + dual-write) the new
// model is authoritative. Output shape is identical to the old code so every
// downstream call site is unaffected.
async function resolveActiveLinks(
  from: string,
  activeWorkspaceId: string | undefined,
): Promise<{ allLinks: PhoneLink[]; link: PhoneLink | null; personId?: string }> {
  const identity = await resolveIdentityByPhone(from);
  if (identity && identity.memberships.length) {
    const allLinks: PhoneLink[] = identity.memberships.map((m) => ({
      phoneNumber: from,
      userId: null,
      workspaceId: m.workspaceId,
      workspaceSlug: m.workspaceSlug,
      workspaceName: m.workspaceName,
      userName: identity.person.fullName,
      userRole: m.role,
    }));
    const active = pickActiveMembership(identity.memberships, activeWorkspaceId);
    const link = active ? allLinks.find((l) => l.workspaceId === active.workspaceId) ?? null : null;
    return { allLinks, link, personId: identity.person.id };
  }

  const allLinks = await lookupAllPhoneLinks(from);
  return { allLinks, link: resolveActivePhoneLink(allLinks, activeWorkspaceId), personId: undefined };
}

function agentCtx(link: PhoneLink, from: string, personId?: string): AgentContext {
  return { workspaceId: link.workspaceId, role: link.userRole as Role, userName: link.userName, phone: from, personId };
}

// Runs the agent and handles its outcome (text answer or a pending confirmation
// proposal). Returns true if it handled the message, false to fall through to
// the single-shot creator. Optional media makes it multimodal.
async function dispatchToAgent(from: string, prompt: string, ctx: AgentContext, media?: MediaPart[]): Promise<boolean> {
  const outcome = await runAgentQuery(prompt, ctx, media);
  if (!outcome) return false;
  if (outcome.kind === "pending") {
    await updateSession(from, { pendingAgentAction: { toolName: outcome.toolName, args: outcome.args } });
    await sendTextMessage(from, `${outcome.preview}\n\nReply *YES* to confirm or *NO* to cancel.`);
    return true;
  }
  if (outcome.text.trim()) {
    await addToHistory(from, "user", prompt);
    await addToHistory(from, "assistant", outcome.text);
    await sendTextMessage(from, outcome.text);
    return true;
  }
  return false;
}

export async function processWhatsAppMessage(message: IncomingMessage): Promise<void> {
  const { from, type } = message;
  const claimed = await claimWhatsAppMessage(message.messageId, from, type);
  if (!claimed) return;

  const session = await getSession(from);
  const { allLinks, link: resolvedLink, personId } = await resolveActiveLinks(from, session.activeWorkspaceId);
  let link = resolvedLink;
  const trimmed = (message.text ?? "").trim();

  if (!session.welcomed) {
    await updateSession(from, { welcomed: true });
    await sendTextMessage(from, link ? buildWorkspaceWelcome(link) : buildGuestWelcome(session.demoBalance));
    if (shouldStopAfterWelcome(message, trimmed)) return;
  }

  // ── Platform-admin: new church signup approval/rejection ──
  // Checked before the generic pendingApproval bare "approve"/"reject"
  // handlers below, and gated by an explicit 8-char code so it can never
  // collide with a workflow-request approval, even for someone who happens
  // to be both a platform admin and a workspace approver.
  if (isPlatformAdmin(from)) {
    const approveMatch = trimmed.match(/^approve\s+([a-z0-9]{8})$/i);
    if (approveMatch) {
      const result = await approveOrganization(approveMatch[1], from);
      if (result) {
        // Platform admin's own confirmation first, unconditionally -- this
        // is always within-session (they just messaged), so it's the one
        // send in this block guaranteed to work regardless of what happens
        // below.
        await sendTextMessage(from, `Approved — ${result.workspaceName} is live.`);

        // The requester's activation message uses a pre-approved WhatsApp
        // template (see docs/superpowers/specs/2026-07-19-whatsapp-template-messages-design.md)
        // since it's almost always outside the 24h session window -- the
        // signup copy itself says approval can take a day or two. Wrapped
        // so a delivery failure doesn't prevent the setup flow from being
        // seeded below.
        try {
          await sendOrgApprovedTemplate(result.requestedByPhone, result.requestedByName, result.workspaceName);
        } catch (err) {
          console.error("Failed to send activation message:", err instanceof Error ? err.message : err);
        }

        // Seeded regardless of whether the message above delivered -- if it
        // didn't, the admin's next message (even just "Hi") still needs to
        // land somewhere sane rather than being silently swallowed as an
        // answer to a question they never saw.
        try {
          const setupPrompt = await startSetupFlow(result.requestedByPhone, result.organizationId, result.workspaceId);
          await sendTextMessage(result.requestedByPhone, setupPrompt);
        } catch (err) {
          console.error("Failed to start setup flow:", err instanceof Error ? err.message : err);
        }
      } else {
        await sendTextMessage(from, "Couldn't find a pending signup with that code — it may already be resolved.");
      }
      return;
    }
    const rejectMatch = trimmed.match(/^reject\s+([a-z0-9]{8})(?:\s+(.+))?$/i);
    if (rejectMatch) {
      const reason = rejectMatch[2]?.trim() || "doesn't fit right now";
      const result = await rejectOrganization(rejectMatch[1]);
      if (result) {
        await sendTextMessage(from, "Rejected.");
        try {
          await sendOrgRejectedTemplate(result.requestedByPhone, result.name, reason);
        } catch (err) {
          console.error("Failed to send rejection message:", err instanceof Error ? err.message : err);
        }
      } else {
        await sendTextMessage(from, "Couldn't find a pending signup with that code — it may already be resolved.");
      }
      return;
    }
  }

  // ── Multi-church disambiguation ──
  // Phone is linked to more than one workspace and the active context isn't
  // resolved. Numeric reply picks one; anything else re-prompts.
  if (!link && allLinks.length > 1) {
    const numeric = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null;
    if (numeric && numeric >= 1 && numeric <= allLinks.length) {
      const chosen = allLinks[numeric - 1];
      await updateSession(from, { activeWorkspaceId: chosen.workspaceId });
      link = chosen;
    } else {
      const options = allLinks.map((l, i) => `${i + 1}. ${l.workspaceName}`).join("\n");
      await sendTextMessage(from, `You're registered with more than one church — which one is this about?\n\n${options}`);
      return;
    }
  }

  // ── Member join-by-code ──
  // A brand-new or unlinked number texting an invite code auto-links as a
  // member, no approval needed (matches the self-serve-member decision).
  // Checked here rather than earlier: an already-linked, disambiguated
  // number has no reason to redeem a code, and platform-admin/onboarding
  // states above take priority.
  //
  // The bare-code fallback (no "JOIN" prefix) only applies to someone's
  // very first message -- that's the wa.me deep-link case, where the code
  // is pre-filled as the entire message text. Restricting it to
  // !session.welcomed (2026-07-18 audit finding) stops a random 8-char
  // string typed later in an ongoing guest conversation from silently
  // joining them to whatever workspace happens to own that code.
  if (!link && trimmed) {
    const joinMatch =
      trimmed.match(/^join[\s-]?([a-z0-9]{8})$/i) ??
      (!session.welcomed && /^[a-z0-9]{8}$/i.test(trimmed) ? [trimmed, trimmed] : null);
    if (joinMatch) {
      const workspace = await findWorkspaceByJoinCode(joinMatch[1]);
      if (workspace) {
        await provisionPersonMembership({
          phoneNumber: from,
          fullName: session.userName ?? "",
          workspaceId: workspace.id,
          workspaceSlug: workspace.slug,
          workspaceName: workspace.name,
          role: "member",
        });
        await sendTextMessage(from, `Welcome to *${workspace.name}*! You're in. Just tell me what you need — give, ask for prayer, or anything else.`);
        return;
      }
      await sendTextMessage(from, "I couldn't find a church with that code — check with your admin, or just tell me your church's name.");
      return;
    }
  }

  // ── Branch admin claim-by-code ──
  // Symmetric to member join-by-code, but grants owner instead of member.
  // The branch admin messages this in themselves -- Chertt never initiates
  // contact with them (2026-07-18 policy decision, see onboarding-flow.ts).
  // claimBranchAdmin guards against a code being reused after a branch
  // already has an owner.
  if (!link && trimmed) {
    const adminMatch = trimmed.match(/^admin[\s-]?([a-z0-9]{8})$/i);
    if (adminMatch) {
      const workspace = await findWorkspaceByJoinCode(adminMatch[1]);
      if (workspace) {
        const claimed = await claimBranchAdmin(workspace.id, from, session.userName ?? "");
        if (claimed) {
          await sendTextMessage(from, `Welcome to *${claimed.workspaceName}* — you're set up as the admin. Just tell me what you need: giving reports, member updates, anything else.`);
          return;
        }
        await sendTextMessage(from, "That branch already has an admin. If that's wrong, contact support@chertt.app.");
        return;
      }
      await sendTextMessage(from, "I couldn't find a branch with that code — check with whoever gave it to you.");
      return;
    }
  }

  // ── In-progress guided flows (signup, post-approval setup, assign-role) ──
  if (trimmed && session.onboarding) {
    const reply =
      session.onboarding.flow === "new-church-signup"
        ? await advanceSignupFlow(from, session, trimmed)
        : session.onboarding.flow === "post-approval-setup"
          ? await advanceSetupFlow(from, session, trimmed)
          : await advanceAssignRoleFlow(from, session, trimmed);
    if (reply) { await sendTextMessage(from, reply); return; }
  }

  if (type === "interactive" && message.buttonReplyId) { await handleButtonReply(from, message.buttonReplyId, session, link); return; }

  if (trimmed && !session.userName && !link) { const name = extractName(trimmed); if (name) await updateSession(from, { userName: name }); }

  if (HELP_RE.test(trimmed)) { await sendHelpMenu(from, session, link); return; }
  if (/^privacy$/i.test(trimmed)) {
    await sendTextMessage(from, "Your messages are stored only to power this conversation and are never shared with third parties. Workspace actions are visible to your workspace admins. To request data deletion, contact support@chertt.app.");
    return;
  }
  // ── Confirm / cancel a pending agent action ──
  // Checked before the single-shot creator's confirm handler and before the
  // agent routing, so a YES executes the exact proposed tool call rather than
  // being treated as a new query.
  if (session.pendingAgentAction) {
    if (/^(yes|y|confirm)$/i.test(trimmed)) {
      const pending = session.pendingAgentAction;
      await updateSession(from, { pendingAgentAction: undefined });
      const tool = getAgentTool(pending.toolName);
      if (!tool || !link) { await sendTextMessage(from, "That action expired — please try again."); return; }
      const actCtx = {
        workspaceId: link.workspaceId,
        role: link.userRole as Role,
        userName: link.userName,
        phone: from,
        personId,
      };
      // Re-check access at execution time (defense in depth — the proposal was
      // already access-checked, but roles can change between messages).
      const denied = toolAccessError(tool, actCtx);
      if (denied) { await sendTextMessage(from, denied); return; }
      const res = (await tool.handler(pending.args, actCtx)) as { message?: string; error?: string };
      await recordToolAudit(actCtx, pending.toolName, pending.args, res.error ? "error" : "ok");
      await sendTextMessage(from, res.error ? `Couldn't complete that: ${res.error}` : (res.message ?? "Done."));
      return;
    }
    if (/^(no|n|cancel)$/i.test(trimmed)) {
      await updateSession(from, { pendingAgentAction: undefined });
      await sendTextMessage(from, "No problem — cancelled. What else can I help you with?");
      return;
    }
  }

  if (/^cancel$/i.test(trimmed)) {
    if (session.onboarding) { await cancelOnboardingFlow(from); await sendTextMessage(from, "Cancelled. What else can I help you with?"); return; }
    await clearPending(from); await sendTextMessage(from, "Cancelled. What else can I help you with?"); return;
  }
  if (/^(confirm|yes)$/i.test(trimmed) && session.pendingConfirmation) { await handleConfirm(from, session, link); return; }
  if (/^no$/i.test(trimmed)) {
    if (session.pendingConfirmation) { await clearPending(from); await sendTextMessage(from, "No problem — cancelled. What else can I help you with?"); }
    else { await sendTextMessage(from, "Got it. What would you like to do instead?"); }
    return;
  }

  // ── New church signup trigger ──
  if (trimmed && isSignupTrigger(trimmed) && !session.onboarding) {
    const reply = await startSignupFlow(from);
    await sendTextMessage(from, reply);
    return;
  }

  // ── Assign-role trigger (branch admins only) ──
  // Gated on the actor holding assign authority in their active branch
  // (canAssignRole against the lowest role = "does this role assign at all").
  if (trimmed && isAssignRoleTrigger(trimmed) && link && !session.onboarding) {
    if (canAssignRole(link.userRole, "member")) {
      const reply = await startAssignRoleFlow(from, link.workspaceId, link.userRole);
      await sendTextMessage(from, reply);
    } else {
      await sendTextMessage(from, "Only branch admins can change roles.");
    }
    return;
  }

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

  // ── Org-wide report intents (cross-branch, org admins only) ──
  if (trimmed) {
    const orgReportKey = matchOrgReportIntent(trimmed);
    if (orgReportKey) {
      const { text, buttons } = await buildOrgWideReport(orgReportKey, from);
      if (buttons?.length) {
        try { await sendInteractiveButtons(from, text, buttons); }
        catch { await sendTextMessage(from, text); }
      } else {
        await sendTextMessage(from, text);
      }
      return;
    }
  }

  // ── Report / query intents ──
  if (trimmed) {
    const reportKey = matchReportIntent(trimmed);
    if (reportKey) {
      // Workspace reports expose giving/members/finances — leadership only.
      // Guests (no link) keep their demo-data reports.
      if (link && roleRank(link.userRole) < 2) {
        await sendTextMessage(from, "Reports are for church admins and leaders — please ask your pastor or an admin.");
        return;
      }
      const [workspaceContext, liveData, givingSummary] = link
        ? await Promise.all([
            loadWorkspaceContext(link.workspaceId),
            loadWorkspaceData(link.workspaceId).catch(() => undefined),
            reportKey === "giving" ? getGivingSummary(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
          ])
        : [undefined, undefined, undefined];
      const { text, buttons } = await buildReport(reportKey, { link, session, workspaceContext, liveData, givingSummary });
      if (buttons?.length) {
        try { await sendInteractiveButtons(from, text, buttons); }
        catch { await sendTextMessage(from, text); }
      } else {
        await sendTextMessage(from, text);
      }
      return;
    }
  }

  // ── Agent: primary handler for all linked-user free text ──
  // The tool-calling agent (read + write + church tools, role-gated) handles
  // any text a linked member sends — the LLM decides what to do, so we no
  // longer rely on English-only regex to decide agent-eligibility. Falls
  // through to the single-shot creator only when the agent is unavailable (no
  // Gemini key) or produces no answer; media (image/voice/doc) still goes to
  // the creator below until the agent gets multimodal tools.
  if (trimmed && link) {
    if (await dispatchToAgent(from, trimmed, agentCtx(link, from, personId))) return;
  }

  if (type === "audio") {
    if (message.mediaId) { await handleVoiceNote(from, message.mediaId, session, link, personId); }
    else { await sendTextMessage(from, "Could not download that voice note. Please type your request."); }
    return;
  }

  if (type === "unknown") { await sendTextMessage(from, "I received a message type I could not read. Please send text, a voice note, or a photo."); return; }
  if (!trimmed && !message.mediaId) { await sendTextMessage(from, "I did not catch that. Please type your request or send an image."); return; }

  if (type === "image" && message.mediaId) {
    let buffer: Buffer; let mimeType: string;
    try { ({ buffer, mimeType } = await downloadMedia(message.mediaId)); }
    catch { await sendTextMessage(from, "Could not download that image. Please try again."); return; }

    // Linked users: the multimodal agent sees the photo and acts (e.g. a
    // receipt → log_expense, if they have permission).
    if (link) {
      const media: MediaPart[] = [{ mimeType, data: buffer.toString("base64") }];
      const agentPrompt = trimmed || "I've sent a photo — please help with it. If it's a receipt or bill, read the merchant and amount.";
      if (await dispatchToAgent(from, agentPrompt, agentCtx(link, from, personId), media)) return;
    }

    // Guest / no-Gemini fallback: receipt OCR auto-log, then the creator.
    const receipt = await extractReceiptInfo(buffer, mimeType);
    if (receipt) { await handleReceiptImage(from, receipt, session, link); return; }
    const mediaAttachment = { mimeType, data: buffer.toString("base64") };
    const prompt = trimmed || "[image]";
    await addToHistory(from, "user", prompt);
    const freshSession = await getSession(from);
    let context: CommandExecutionContext;
    if (link) { const [ctx, kb] = await Promise.all([loadWorkspaceContext(link.workspaceId), loadKnowledgeContext(link.workspaceId)]); context = buildWorkspaceCtx(link, ctx, freshSession, mediaAttachment, kb); }
    else { context = buildGuestContext(freshSession, mediaAttachment); }
    const result = await runCherttCommand(prompt, context, false);
    await handleAiResult(from, result, prompt, freshSession, link);
    return;
  }

  if (type === "document" && message.mediaId) {
    let buffer: Buffer; let mimeType: string;
    try { ({ buffer, mimeType } = await downloadMedia(message.mediaId)); }
    catch { await sendTextMessage(from, "Could not download that file. Please try again."); return; }

    if (link) {
      const media: MediaPart[] = [{ mimeType, data: buffer.toString("base64") }];
      const agentPrompt = trimmed || "I've sent a document — please help me with it.";
      if (await dispatchToAgent(from, agentPrompt, agentCtx(link, from, personId), media)) return;
    }

    const mediaAttachment = { mimeType, data: buffer.toString("base64") };
    const prompt = trimmed || "[document attachment]";
    await addToHistory(from, "user", prompt);
    const freshSession = await getSession(from);
    let context: CommandExecutionContext;
    if (link) { const [ctx, kb] = await Promise.all([loadWorkspaceContext(link.workspaceId), loadKnowledgeContext(link.workspaceId)]); context = buildWorkspaceCtx(link, ctx, freshSession, mediaAttachment, kb); }
    else { context = buildGuestContext(freshSession, mediaAttachment); }
    const result = await runCherttCommand(prompt, context, false);
    await handleAiResult(from, result, prompt, freshSession, link);
    return;
  }

  if (trimmed) {
    await addToHistory(from, "user", trimmed);
    const freshSession = await getSession(from);
    let context: CommandExecutionContext;
    if (link) { const [ctx, kb] = await Promise.all([loadWorkspaceContext(link.workspaceId), loadKnowledgeContext(link.workspaceId)]); context = buildWorkspaceCtx(link, ctx, freshSession, undefined, kb); }
    else { context = buildGuestContext(freshSession); }
    const result = await runCherttCommand(trimmed, context, false);
    await handleAiResult(from, result, trimmed, freshSession, link);
  }
}
