import { GoogleGenAI } from "@google/genai";
import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
  deductDemoBalance,
  type WhatsAppSession,
} from "@/lib/services/whatsapp-session";
import { sendTextMessage, sendInteractiveButtons, sendInteractiveList, sendUrlButton, downloadMedia } from "@/lib/services/whatsapp";
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
  getServiceSnapshot,
  getOverviewExtras,
  getOrganizationWorkspaces,
  isPlatformAdmin,
  approveOrganization,
  rejectOrganization,
  findWorkspaceByJoinCode,
  findWorkspaceByUsername,
  claimBranchAdmin,
  type PhoneLink,
  type WorkspaceContext,
} from "@/lib/services/whatsapp-workspace";
import { provisionPersonMembership, ensureVerifiedPerson } from "@/lib/services/identity/provisioning";
import { resolveIdentityByPhone, pickActiveMembership } from "@/lib/services/identity/resolver";
import { isAssignRoleTrigger, startAssignRoleFlow, advanceAssignRoleFlow } from "@/lib/services/identity/assign-role-flow";
import { canAssignRole, roleRank } from "@/lib/services/identity/role-catalog";
import { roleLabel } from "@/lib/services/agent/persona";
import { runAgentQuery, runGuestAgent, getAgentTool, type MediaPart } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import { menuForRole, menuPromptFor } from "@/lib/services/agent/menu";
import { decideDepartmentRequest } from "@/lib/services/approvals/department";
import { resetSenderData } from "@/lib/services/demo-reset";
import { resetSession } from "@/lib/services/whatsapp-session";
import { recordToolAudit } from "@/lib/services/agent/audit";
import { recordConsent, setOptedOut, clearOptOut, logDataRequest } from "@/lib/services/privacy/consent";
import { assessRisk } from "@/lib/services/safety/risk";
import { flagMessage } from "@/lib/services/safety/flags";
import { persistChatAttachment } from "@/lib/services/chat-attachments";
// Side-effect import: registers every deterministic task flow with the engine.
import "@/lib/services/flows";
import { advanceFlow, startFlow, type FlowOutput } from "@/lib/services/flows/engine";
import { confirmMemberEmail } from "@/lib/services/identity/email-verify";
import { getWorkspaceBilling, isSubscriptionActive } from "@/lib/services/billing/subscription";
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
const HELP_RE = /^(?:help|help me|i need help|need help|pls help|please help|can (?:you|u) help(?: me)?|abeg(?: help(?: me)?)?|wetin i go do|i no (?:understand|sabi|know)|i dey (?:confused|lost)|commands?|guide me|how (?:do|can) i use (?:this|chertt)|i(?:'m| am)? (?:lost|confused|stuck)(?: .*)?|i don'?t (?:know|understand)(?: .*)?|not sure(?: .*)?)$/i;
// Anything that means "just show me the buttons" — routed to the tappable menu
// so a member never has to type a command out.
const MENU_RE = /^(?:menu|the menu|menu\s*(?:please|abeg|biko)?|show(?:\s*me)?\s*(?:the\s*)?menu|where(?:'?s| is)\s*(?:the\s*)?menu|show me around|options?|start over|come again\??|what can (?:you|u|chertt|i) do)$/i;
// Guest navigational / exploratory intents (NOT anchored — people phrase these
// loosely). Anything that means "show me my options" gets the tappable
// who-are-you buttons instead of a wall of text — people tap, they don't type.
const GUEST_LOST_RE = /\b(menu|options?|get\s*started|start over|how (?:does |do |is |'?s )?(?:this|it|chertt)\s*works?|see how (?:this|it|chertt)\s*works?|what can (?:you|u|chertt)\s*do|show me around|do (?:you|u) have (?:a |an |any )?menu|any menu)\b/i;

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
    name ? "*Hi " + name + "! Here's everything I can help with.*" : "*Here's everything I can help with.*",
    "",
    "Just talk to me normally — type or send a voice note:",
    "",
    "💰 *Give* — \"I want to give ₦5,000 tithe\"",
    "🕊️ *Prayer* — \"Please pray for my mum, she's unwell\"",
    "👋 *First time?* — \"I'm new here, my name is Ada\"",
    "👶 *Kids* — \"Check in my daughter Amara, age 6\"",
    "🤝 *Belong* — \"I'd like to join the choir\"",
    "📅 *Events* — \"What's on this week?\" · \"Register me for the retreat\"",
    "📝 *Service* — \"Record today's service: 120 adults, ₦45k offering\"",
    "📊 *Reports* — \"How much giving this month?\" · \"Church overview\"",
    "💡 *More* — Ask me anything at all — I've got you. 🙂",
  ].join("\n");
}

async function sendHelpMenu(from: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  const text = buildHelpText(link, session);
  try {
    await sendInteractiveButtons(from, text, [
      { id: "help_give", title: "Give" },
      { id: "help_prayer", title: "Prayer" },
      { id: "help_checkin", title: "Check in a child" },
    ], "How can I help?");
  } catch {
    await sendTextMessage(from, text);
  }
  await addToHistory(from, "assistant", "Sent church help menu");
}

async function handleHelpButton(from: string, buttonId: string): Promise<boolean> {
  const guides: Record<string, string> = {
    help_give: [
      "*Giving* 🙏",
      "",
      "Just tell me the amount and type, e.g.:",
      "\"I want to give ₦5,000 tithe\"",
      "",
      "I'll send you a secure link to complete it, and record it once it's done.",
    ].join("\n"),
    help_prayer: [
      "*Prayer requests* 🕊️",
      "",
      "Tell me what to pray about, e.g.:",
      "\"Please pray for my mother's health\"",
      "",
      "Say it's anonymous if you'd rather not share your name.",
    ].join("\n"),
    help_checkin: [
      "*Children's check-in* 👶",
      "",
      "Tell me the child's details, e.g.:",
      "\"Check in my son Timmy, age 5, allergic to peanuts\"",
      "",
      "You'll get a pickup code to show at collection.",
    ].join("\n"),
    help_firsttimer: [
      "*First time at church?* 👋",
      "",
      "Welcome! Tell me about yourself, e.g.:",
      "\"I'm new here, my name is Ada, I came with a friend\"",
      "",
      "I'll let the pastoral team know so they can follow up with you.",
    ].join("\n"),
    help_join: [
      "*Join a ministry or department* 🤝",
      "",
      "Tell me which group you'd like to join, e.g.:",
      "\"I'd like to join the choir\" or \"Sign me up for the ushering team\"",
      "",
      "I'll send your request to the department leader for approval.",
    ].join("\n"),
    help_event: [
      "*Events & Programmes* 📅",
      "",
      "Ask me what's coming up or register for something:",
      "\"What events are on this month?\"",
      "\"Register me for the women's conference\"",
      "",
      "I'll confirm your spot and send you the details.",
    ].join("\n"),
    help_service: [
      "*Record a service* 📝",
      "",
      "After service, tell me the numbers — leaders and pastors can log:",
      "\"Record today: 150 adults, 40 children, ₦55k tithe, ₦30k offering\"",
      "",
      "You can also note the sermon title, first-timers, and salvations.",
    ].join("\n"),
  };
  const guide = guides[buttonId];
  if (guide) {
    await sendTextMessage(from, guide);
    await addToHistory(from, "assistant", guide);
    return true;
  }
  // "More help" — re-send the full help menu with buttons
  if (buttonId === "help_more") {
    const session = await getSession(from);
    // resolve link for role-aware help (best-effort; fallback to guest context)
    const { link } = await resolveActiveLinks(from, session.activeWorkspaceId);
    await sendHelpMenu(from, session, link);
    return true;
  }
  return false;
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

// Consent-first: the very first thing a new number sees is an explicit privacy
// consent ask. We record data only after they agree. NDPR/NDPA: consent should
// be a clear affirmative action, not buried fine print.
async function sendConsentGate(from: string): Promise<void> {
  const text = [
    "👋 Welcome to *Chertt* — I help churches run everything on WhatsApp.",
    "",
    "First, your privacy: we store the details you share *only* to help your church serve you, we never sell your data, and you can opt out anytime by replying *stop* (Nigeria NDPR).",
    "",
    "Do you agree to continue?",
  ].join("\n");
  try {
    await sendInteractiveButtons(from, text, [
      { id: "guest_consent", title: "✅ I agree" },
      { id: "guest_privacy", title: "📄 Privacy policy" },
      { id: "guest_optout", title: "🚫 No thanks" },
    ], "Your privacy");
  } catch {
    await sendTextMessage(from, text + "\n\nReply *agree* to continue, *privacy* to read our policy, or *stop* to opt out.");
  }
}

async function sendGuestWelcome(from: string): Promise<void> {
  const text = [
    "👋 Hi! I'm *Chertt* — I help churches run everything right here on WhatsApp.",
    "",
    "So I point you the right way — who are you? Tap below, or just tell me in your own words 👇",
    "",
    "_By continuing, you agree we store your details to help your church serve you. Type *privacy* to read how, or *stop* to opt out._",
  ].join("\n");
  try {
    await sendInteractiveButtons(from, text, [
      { id: "guest_member", title: "Member / visiting" },
      { id: "guest_child", title: "Here for my child" },
      { id: "guest_leader", title: "I lead a church" },
    ], "Welcome 👋");
  } catch {
    await sendTextMessage(from, text + "\n\n🙌 *Attend a church?* Reply *member* (or send the code your church gave you).\n👨‍👩‍👧 *Registering a child?* Reply *child*.\n⛪ *Lead a church?* Reply *lead*.");
  }
}

// The main menu as a WhatsApp interactive list — role-aware (WS-menu): the rows
// offered are exactly the tools this caller is allowed to use, derived from the
// same permission machinery that guards execution. Page 2 holds the overflow.
async function sendMainMenu(from: string, link: PhoneLink | null, page = 1): Promise<void> {
  if (!link) { await sendGuestWelcome(from); return; }
  const rows = menuForRole(link.userRole ?? "member", page);
  try {
    await sendInteractiveList(from, "What do you need? 👇", "Open menu", rows, "Menu");
  } catch {
    await sendTextMessage(from, "Try: give ₦5,000 tithe · ask for prayer · check in a child · giving this month · I'm new here · join a ministry · events");
  }
}

// Proactive, role-aware welcome. A first-time member shouldn't have to ask
// "what's my role" or "any menu" — we open by telling them who they are here
// and offering a few concrete things to do, tailored to a leader vs a member.
// Sent alongside the tappable buttons (see sendWorkspaceWelcome) so the menu is
// proposed, never demanded.
function buildWorkspaceWelcome(link: PhoneLink): string {
  const name = link.userName ? link.userName : "there";
  const leader = roleRank(link.userRole) >= 4;
  const ideas = leader
    ? [
        "💰 *Give* — “give ₦5,000 tithe”",
        "📊 *See how giving's going* — “how much giving this month?”",
        "📝 *Record a service* — “120 adults, 30 kids, ₦45k offering”",
        "✅ *Handle approvals* — “what needs my approval?”",
      ]
    : [
        "💰 *Give* — “give ₦5,000 tithe”",
        "🙏 *Ask for prayer* — “please pray for my mum”",
        "👶 *Check a child in* — “check in my son, age 5”",
        "🤝 *Join something* — “I'd like to join the choir”",
      ];
  return [
    "Welcome, " + name + "! 🙏 You're " + roleLabel(link.userRole) + " at *" + link.workspaceName + "*" +
      (leader ? " — you can run the whole church from right here." : "."),
    "",
    "Here are a few things I can do for you:",
    ...ideas,
    "",
    "Tap a button below to start, or just tell me what you need — you can type or send a voice note. 👇",
  ].join("\n");
}

// Sends the welcome text together with the one-tap starter buttons, so a brand-
// new member sees the menu proposed on first contact. Falls back to plain text
// if interactive messaging fails.
async function sendWorkspaceWelcome(from: string, link: PhoneLink): Promise<void> {
  const text = buildWorkspaceWelcome(link);
  try {
    await sendInteractiveButtons(from, text, [
      { id: "help_give", title: "Give" },
      { id: "help_prayer", title: "Prayer" },
      { id: "help_checkin", title: "Check in a child" },
    ], "Welcome 🙏");
  } catch {
    await sendTextMessage(from, text);
  }
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
    const lines = ["*" + link.workspaceName + " — at a glance*", ""];
    if (ctx.pendingRequests.length) {
      lines.push("*Pending approvals (" + ctx.pendingRequests.length + ")*");
      for (const r of ctx.pendingRequests) lines.push("• " + r.title + (r.amount ? " — " + fmt(r.amount) : ""));
      lines.push("");
    }
    if (ctx.pendingIssues.length) {
      lines.push("*Open issues (" + ctx.pendingIssues.length + ")*");
      for (const i of ctx.pendingIssues) lines.push("• " + i.title + " [" + i.severity + "]");
      lines.push("");
    }
    if (!ctx.pendingRequests.length && !ctx.pendingIssues.length) {
      lines.push("All clear — nothing pending right now. 🙌");
      lines.push("");
    }
    lines.push("Ask me anything — giving, prayer, first-timers, today's service, and more.");
    await sendTextMessage(from, lines.join("\n"));
  } else {
    await sendTextMessage(from, "You're not connected to a church yet. Reply *set up my church* to begin, or send your church's code.");
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
    return;
  }

  const replyText = (formatAiResult(result, freshSession, link).text || "Something went wrong. Please try again.") + approvalDeliveryNote;
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
      const [giving, snapshot, wc] = await Promise.all([
        getGivingSummary(b.id).catch(() => undefined),
        getServiceSnapshot(b.id).catch(() => undefined),
        loadWorkspaceContext(b.id).catch(() => undefined),
      ]);
      return {
        id: b.id,
        name: b.name,
        giving,
        snapshot,
        pending: wc?.pendingRequests?.length ?? 0,
        issues: wc?.pendingIssues?.length ?? 0,
      };
    }),
  );
  return buildOrgOverviewReport(perBranch);
}

// ── Department approvals (quorum 'any') ──────────────────────────────────────
async function handleDepartmentDecision(from: string, requestId: string, decision: "approve" | "decline"): Promise<void> {
  const result = await decideDepartmentRequest(requestId, from, decision);
  if (!result) { await sendTextMessage(from, "That request has already been decided."); return; }
  await sendTextMessage(from, `${result.status === "approved" ? "✅ Approved" : "❌ Declined"} ${result.memberName}'s request to join ${result.unitName}.`);
  if (result.memberPhone && result.memberPhone !== from) {
    await sendTextMessage(result.memberPhone, result.status === "approved"
      ? `🎉 You're in! Your request to join ${result.unitName} was approved. See you Sunday.`
      : `Your request to join ${result.unitName} was declined — a leader will reach out to you.`);
  }
  for (const phone of result.otherApprovers) {
    if (phone !== from) {
      await sendTextMessage(phone, `${from} ${result.status === "approved" ? "approved" : "declined"} ${result.memberName}'s ${result.unitName} request.`);
    }
  }
}

// Renders a flow engine output to WhatsApp, with the same try/catch-to-text
// fallback used by the report/menu helpers — a Meta error never strands the
// conversation.
async function sendFlowOutput(from: string, out: FlowOutput): Promise<void> {
  if (out.type === "buttons") {
    try { await sendInteractiveButtons(from, out.text, out.buttons, out.header); return; }
    catch { await sendTextMessage(from, out.text); return; }
  }
  if (out.type === "list") {
    try { await sendInteractiveList(from, out.text, out.buttonLabel, out.rows, out.header); return; }
    catch { await sendTextMessage(from, out.text); return; }
  }
  if (out.type === "urlButton") {
    try { await sendUrlButton(from, out.text, out.url, out.buttonLabel); return; }
    catch { await sendTextMessage(from, `${out.text}\n\n${out.url}`); return; }
  }
  await sendTextMessage(from, out.text);
}

async function handleButtonReply(from: string, buttonId: string, session: WhatsAppSession, link: PhoneLink | null, personId?: string | null): Promise<void> {
  if (await handleHelpButton(from, buttonId)) return;  if (buttonId === "confirm") { await handleConfirm(from, session, link); return; }
  if (buttonId === "cancel") { await clearPending(from); await sendTextMessage(from, "Cancelled. What else can I help you with?"); return; }

  // ── Consent gate (must agree before anything is stored/used) ──
  if (buttonId === "guest_consent") {
    if (personId) recordConsent({ personId, source: "whatsapp_first_contact" }).catch(() => {});
    // Consent given — open the guest front door ON RAILS.
    const out = await startFlow("guest_connect", { phone: from, link: null, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
    await sendGuestWelcome(from); // fallback if the flow failed to start
    return;
  }
  if (buttonId === "guest_privacy") {
    await sendTextMessage(from, "Here's exactly how we handle your data: https://chertt.app/privacy\n\nReply *I agree* to continue, or *stop* to opt out.");
    return;
  }
  if (buttonId === "guest_optout") {
    await sendTextMessage(from, "No problem — I won't store your details or message you again. Reply *hi* anytime if you change your mind. 🙏");
    await setOptedOut(from).catch(() => {});
    return;
  }

  // ── Guest navigation buttons (unlinked users) ──
  // First-contact is about knowing WHO is texting — a member, a family, or a
  // church leader — so we never push church-setup at someone who isn't a leader
  // (a child or a visitor should never be told to "set up a church").
  // Tapping any persona button is the first substantive action → consent by
  // continuing, recorded on the person (Slice B).
  if (buttonId === "guest_member") {
    if (personId) recordConsent({ personId, source: "whatsapp_first_contact" }).catch(() => {});
    // Route into the connect rail — the single guest front door. (Replaces the
    // old give/prayer/ministry sub-menu that dead-ended in "send your code".)
    const out = await startFlow("guest_connect", { phone: from, link: null, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
    await updateSession(from, { awaitingJoinCode: true });
    await sendTextMessage(from, "Send your church's *code* or *@username* here and I'll connect you. 🙏");
    return;
  }
  if (buttonId === "guest_child") {
    if (personId) recordConsent({ personId, source: "whatsapp_first_contact" }).catch(() => {});
    // WS5 — tappable next steps for families too.
    await sendInteractiveButtons(from, "Lovely to have your family 👨‍👩‍👧 To keep children safe, a parent or guardian registers them — never the child.", [
      { id: "guest_code", title: "Send my code" },
      { id: "guest_help", title: "Talk to a leader" },
    ]);
    return;
  }
  // Only a self-identified leader is routed to church setup/management.
  if (buttonId === "guest_leader" || buttonId === "guest_setup") {
    if (personId) recordConsent({ personId, source: "whatsapp_first_contact" }).catch(() => {});
    const { text, url } = await startSignupFlow(from);
    if (url) {
      try { await sendUrlButton(from, text, url, "Verify my church"); } catch { await sendTextMessage(from, `${text}\n\n${url}`); }
    } else {
      await sendTextMessage(from, text);
    }
    return;
  }
  if (buttonId === "guest_code") {
    await updateSession(from, { awaitingJoinCode: true });
    await sendTextMessage(from, "📨 Send the 8-character code your church gave you — I'll connect you right away.");
    return;
  }
  if (buttonId === "guest_help") {
    await sendHelpMenu(from, session, null);
    return;
  }

  // ── Switch active church (pick from the switch-church list) ──
  if (buttonId.startsWith("switch:")) {
    const wsId = buttonId.slice("switch:".length);
    const links = await lookupAllPhoneLinks(from);
    const target = links.find((l) => l.workspaceId === wsId);
    if (!target) { await sendTextMessage(from, "Couldn't switch just now — send the church's code to connect."); return; }
    await updateSession(from, { activeWorkspaceId: wsId });
    await sendTextMessage(from, `✅ You're now in *${target.workspaceName}*. What do you need?`);
    return;
  }

  // ── Menu button — available to any linked member ──
  if (buttonId === "main_menu") { await sendMainMenu(from, link); return; }

  // ── P0-2 join confirmation ──
  if (buttonId === "join_yes") {
    const pj = session.pendingJoin;
    await updateSession(from, { pendingJoin: undefined });
    if (pj) {
      await provisionPersonMembership({
        phoneNumber: from,
        fullName: session.userName ?? "",
        workspaceId: pj.workspaceId,
        workspaceSlug: pj.slug,
        workspaceName: pj.name,
        role: "member",
      });
      await sendTextMessage(from, `🎉 You're connected to *${pj.name}*! What can I help you with today?`);
    } else {
      await sendTextMessage(from, "Send your church's 8-character code and I'll connect you.");
    }
    return;
  }
  if (buttonId === "join_no") {
    await updateSession(from, { pendingJoin: undefined });
    await sendTextMessage(from, "No problem — send the right code whenever you're ready, or tell me your church's name.");
    return;
  }
  if (buttonId.startsWith("approve_dept:") || buttonId.startsWith("decline_dept:")) {
    const [verb, requestId] = buttonId.split(":");
    await handleDepartmentDecision(from, requestId, verb === "approve_dept" ? "approve" : "decline");
    return;
  }
  if (buttonId === "menu_more") { await sendMainMenu(from, link, 2); return; }
  // Menu rows that map to a deterministic flow start the flow, not the agent.
  const MENU_FLOW: Record<string, string> = {
    "menu:checkin": "child_checkin",
    "menu:register_child": "child_register",
    "menu:give": "give",
    "menu:prayer": "prayer",
    "menu:pastoral": "pastoral",
    "menu:pastoral_form": "pastoral_form",
    "menu:first_timer": "first_timer",
    "menu:life_journey": "life_journey",
    "menu:issue": "issue",
    "menu:register_event": "event_register",
    "menu:record_giving": "record_giving",
    "menu:join_dept": "join",
  };
  if (link && MENU_FLOW[buttonId]) {
    const out = await startFlow(MENU_FLOW[buttonId], { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
  }
  if (buttonId.startsWith("menu:")) {
    const prompt = menuPromptFor(buttonId.slice(5));
    if (prompt) {
      // Feed the prompt through the exact same path as a typed message — every
      // guard (confirmation gates, consent, role checks) still applies.
      if (link && (await dispatchToAgent(from, prompt, agentCtx(link, from, personId ?? undefined)))) return;
      await addToHistory(from, "user", prompt);
      const freshSession = await getSession(from);
      let context: CommandExecutionContext;
      if (link) { const [ctx, kb] = await Promise.all([loadWorkspaceContext(link.workspaceId), loadKnowledgeContext(link.workspaceId)]); context = buildWorkspaceCtx(link, ctx, freshSession, undefined, kb); }
      else { context = buildGuestContext(freshSession); }
      const result = await runCherttCommand(prompt, context, false);
      await handleAiResult(from, result, prompt, freshSession, link);
      return;
    }
  }

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
    const wantsGiving = key === "giving" || key === "overview";
    const [workspaceContext, liveData, givingSummary, serviceSnapshot, overviewExtras] = link
      ? await Promise.all([
          loadWorkspaceContext(link.workspaceId),
          loadWorkspaceData(link.workspaceId).catch(() => undefined),
          wantsGiving ? getGivingSummary(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
          key === "overview" ? getServiceSnapshot(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
          key === "overview" ? getOverviewExtras(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
        ])
      : [undefined, undefined, undefined, undefined, undefined];
    const { text, buttons } = await buildReport(key, { link, session, workspaceContext, liveData, givingSummary, serviceSnapshot, overviewExtras });
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
  // WS-A: the audio file itself is persisted (private bucket + row), never
  // silently dropped — best-effort so a storage hiccup can't block the reply.
  void persistChatAttachment({ workspaceId: link?.workspaceId ?? null, personId: personId ?? null, kind: "audio", buffer, mimeType });
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

  // Every inbound number is a known, number-verified (L1) person — the message
  // proves control of the number. Best-effort; never blocks handling.
  await ensureVerifiedPerson(from).catch(() => null);

  // Re-engagement clears opt-out: any message from an opted-out number is the
  // person opting back in (Slice B). Best-effort.
  await clearOptOut(from).catch(() => null);

  const session = await getSession(from);
  const { allLinks, link: resolvedLink, personId } = await resolveActiveLinks(from, session.activeWorkspaceId);
  let link = resolvedLink;
  const trimmed = (message.text ?? "").trim();

  if (!session.welcomed) {
    await updateSession(from, { welcomed: true });
    if (link) {
      await sendWorkspaceWelcome(from, link);
      if (shouldStopAfterWelcome(message, trimmed)) return;
    } else {
      // Guests must consent to our privacy terms BEFORE anything else.
      await sendConsentGate(from);
      return;
    }
  }

  // ── WS3 risk triage — BEFORE any agent/creator routing, so a scam can
  // never be acted on and a safeguarding disclosure is never left to chance.
  // Deterministic; the LLM never decides these.
  if (trimmed) {
    const risk = assessRisk(trimmed);
    if (risk.kind === "safeguarding") {
      await sendTextMessage(from, "I'm so sorry you're going through this — you are not alone. Please reach someone you trust right now: in Nigeria you can call *112*, or talk to a pastor/leader near you. I've quietly alerted your church leaders so a real person follows up with you very soon. 🙏");
      await flagMessage({
        fromPhone: from, personId: personId ?? null, workspaceId: link?.workspaceId ?? null,
        kind: "safeguarding", reason: risk.reason, excerpt: trimmed,
      }).catch(() => {});
      return;
    }
    if (risk.kind === "scam") {
      await sendTextMessage(from, "⚠️ Careful — this looks like a scam. Please don't send money, share any code (especially an OTP), or click that link. Real leaders never ask for your OTP or urgent transfers to a new account. I've flagged it for your church leaders.");
      await flagMessage({
        fromPhone: from, personId: personId ?? null, workspaceId: link?.workspaceId ?? null,
        kind: "scam", reason: risk.reason, excerpt: trimmed,
      }).catch(() => {});
      return;
    }
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

  // ── P0-5 #reset — the owner wipes their own conversation + links ──
  if (trimmed.toLowerCase() === "#reset") {
    await resetSenderData(from).catch(() => {});
    await resetSession(from);
    await sendTextMessage(from, "🧹 Done — all your chat memory and church links on Chertt are wiped. Your next message starts completely fresh, like a brand-new guest.");
    return;
  }

  // ── In-progress task flow (flow engine) ──
  // An active rail owns the turn — text OR button tap — for members AND guests,
  // so it wins over the ad-hoc join-code / admin-claim matchers below. Global
  // guards that must always win (message-claim, welcome/consent, risk triage,
  // #reset, platform admin, multi-church disambiguation) all return above this.
  // Opt-out keywords still escape (they fall through to the handler below).
  if (session.activeFlow && !/^(stop|unsubscribe|remove me)$/i.test(trimmed)) {
    const runCtx = { phone: from, link, personId: personId ?? undefined, session };
    const input = { text: trimmed, buttonId: message.buttonReplyId };
    const out = await advanceFlow(input, runCtx, (patch) => updateSession(from, patch));
    if (out) {
      await addToHistory(from, "user", message.buttonReplyId ? `[tap] ${message.buttonReplyId}` : trimmed);
      await sendFlowOutput(from, out);
      return;
    }
  }

  // ── Async member email verification: "verify <code>" ──
  // Non-blocking confirmation of the email captured on the connect rail. Placed
  // after the flow block (an active rail still owns the turn) so it only fires
  // for a standalone "verify 123456" when the member isn't mid-flow. Optional —
  // a wrong/expired code is reassuring, never alarming.
  const verifyMatch = trimmed.match(/^verify\s+(\d{3,8})$/i);
  if (verifyMatch) {
    const res = await confirmMemberEmail(from, verifyMatch[1]);
    const reply =
      res.status === "verified"
        ? `✅ Email confirmed${res.email ? ` — ${res.email}` : ""}. Thank you! 🙏`
        : res.status === "no_email"
          ? "I don't have an email on file for you yet — you can add one when you connect to your church."
          : "That code didn't match or has expired. No worries — it's optional, and you're already connected. 🙏";
    await addToHistory(from, "user", trimmed);
    await sendTextMessage(from, reply);
    return;
  }

  // ── Subscription status / billing (PLACEHOLDER) ──
  // A connected member checks their church's Chertt subscription and gets the
  // demo activation link. No real charge — the link opens the placeholder
  // billing page. Only for linked users (a guest has no church to bill).
  if (link && /^(subscription|billing|renew|my subscription)$/i.test(trimmed)) {
    const billing = await getWorkspaceBilling(link.workspaceId);
    await addToHistory(from, "user", trimmed);
    if (!billing) {
      await sendTextMessage(from, "There's no subscription to manage for this church yet.");
      return;
    }
    const active = isSubscriptionActive(billing.sub);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app").replace(/\/$/, "");
    const link_ = `${appUrl}/billing/${billing.organizationId}`;
    await sendTextMessage(
      from,
      active
        ? `✅ *${link.workspaceName}* — subscription active (${billing.sub.plan ?? "Chertt Standard"}). Manage it here:\n${link_}\n\n_(Demo — no real charge.)_`
        : `⚠️ *${link.workspaceName}* — subscription is *${billing.sub.status}*. Activate it here so your members can connect:\n${link_}\n\n_(Demo — no real charge.)_`,
    );
    return;
  }

  // ── Switch active church (multi-church members) ──
  // Once a multi-church member is resolved to one church, this is how they move
  // to another (otherwise they'd be stuck until #reset). Tap-to-switch list.
  if (link && /^switch( church(es)?)?$|^switch to\b|^change church(es)?$/i.test(trimmed)) {
    await addToHistory(from, "user", trimmed);
    if (allLinks.length <= 1) {
      await sendTextMessage(from, `You're only connected to *${link.workspaceName}*. Send another church's code to join a second one.`);
      return;
    }
    const rows = allLinks.map((l) => ({
      id: `switch:${l.workspaceId}`,
      title: l.workspaceName.slice(0, 24),
      description: l.workspaceId === link!.workspaceId ? "Current" : "",
    }));
    try {
      await sendInteractiveList(from, "Which church do you want to switch to?", "Choose", rows, "Switch church");
    } catch {
      await sendTextMessage(from, `You're in *${link.workspaceName}*. Your churches: ${allLinks.map((l) => l.workspaceName).join(", ")}.`);
    }
    return;
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
    const prefixed = trimmed.match(/^join[\s-]?@?([a-z0-9_]{3,20})$/i);
    const bareCode = (!session.welcomed || session.awaitingJoinCode)
      ? trimmed.match(/^([a-z0-9]{8})$/i)
      : null;
    // P2-2: a bare @username works like a bare code (confirm-first).
    const bareUsername = (!session.welcomed || session.awaitingJoinCode)
      ? trimmed.match(/^@([a-z0-9_]{3,20})$/i)
      : null;
    const identifier = prefixed?.[1] ?? bareCode?.[1] ?? bareUsername?.[1] ?? null;
    const explicitUsername = prefixed && /^join[\s-]?@/i.test(trimmed) ? prefixed[1] : (bareUsername?.[1] ?? null);
    if (identifier) {
      let workspace = await findWorkspaceByJoinCode(identifier);
      // Username fallback only when it's an explicit @username or not shaped
      // like a join code — a bare 8-char string never accidentally becomes
      // a username match (2026-07-18 audit rule).
      if (!workspace && (explicitUsername || !/^[a-z0-9]{8}$/i.test(identifier))) {
        workspace = await findWorkspaceByUsername(explicitUsername ?? identifier);
      }
      if (workspace) {
        // Explicit "JOIN <code>" keeps its instant path (clear intent).
        if (prefixed) {
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
        // P0-2 — a bare code is never linked silently: reflect the church
        // back and make the person confirm before anything is stored.
        await updateSession(from, {
          awaitingJoinCode: false,
          pendingJoin: { workspaceId: workspace.id, slug: workspace.slug, name: workspace.name, city: workspace.city ?? "" },
        });
        const city = workspace.city ? `, ${workspace.city}` : "";
        await sendInteractiveButtons(
          from,
          `That's *${workspace.name}*${city}. Is this your church?`,
          [
            { id: "join_yes", title: "✅ Yes, connect me" },
            { id: "join_no", title: "❌ No" },
          ],
          "Connect to church",
        );
        return;
      }
      await sendTextMessage(from, "I couldn't find a church with that code or username — check with your admin, or just tell me your church's name.");
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

  if (type === "interactive" && message.buttonReplyId) { await handleButtonReply(from, message.buttonReplyId, session, link, personId); return; }

  if (trimmed && !session.userName && !link) { const name = extractName(trimmed); if (name) await updateSession(from, { userName: name }); }

  // ── Menu / lost — any linked member gets the tappable menu, no typing a
  // command out. Placed before HELP_RE so the richer list wins. ──
  if (link && MENU_RE.test(trimmed)) { await sendMainMenu(from, link); return; }
  // Guests get the tappable guest front-door rail for any menu / "how does
  // this work" / options intent — never a "we don't have a menu" text reply.
  if (!link && (MENU_RE.test(trimmed) || GUEST_LOST_RE.test(trimmed))) {
    const out = await startFlow("guest_connect", { phone: from, link: null, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
    await sendGuestWelcome(from);
    return;
  }

  if (HELP_RE.test(trimmed)) { await sendHelpMenu(from, session, link); return; }
  // Typed consent (for guests who type instead of tapping the gate button).
  if (!link && /^(i\s*)?agree\b.*$|^(yes,?\s*)?i\s*agree$/i.test(trimmed)) {
    if (personId) recordConsent({ personId, source: "whatsapp_first_contact" }).catch(() => {});
    const out = await startFlow("guest_connect", { phone: from, link: null, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
    await sendGuestWelcome(from);
    return;
  }
  if (/^privacy$/i.test(trimmed)) {
    await logDataRequest({ kind: "access", note: "privacy info requested", personId: personId ?? undefined, workspaceId: link?.workspaceId ?? undefined }).catch(() => {});
    await sendTextMessage(from, "Your details are stored only to help your church serve you — never shared with third parties. Full policy: https://chertt.app/privacy · To have your data removed, reply *stop* or email support@chertt.app.");
    return;
  }
  if (/^(stop|unsubscribe|remove me)$/i.test(trimmed)) {
    // Confirm FIRST (while the number is still messageable), THEN record the
    // opt-out — after which all future outbound sends are suppressed.
    await sendTextMessage(from, "No problem — I won't reach out again, and I've noted your request. To have your data removed entirely, reply *delete my data* or email support@chertt.app. Full policy: https://chertt.app/privacy");
    await setOptedOut(from).catch(() => {});
    await logDataRequest({ kind: "deletion", note: `opt-out via STOP from ${from}`, personId: personId ?? undefined, workspaceId: link?.workspaceId ?? undefined }).catch(() => {});
    return;
  }
  if (/^delete my data$/i.test(trimmed)) {
    await sendTextMessage(from, "I've noted your request — the church team will remove your details. Full policy: https://chertt.app/privacy");
    await logDataRequest({ kind: "deletion", note: `delete-my-data request from ${from}`, personId: personId ?? undefined, workspaceId: link?.workspaceId ?? undefined }).catch(() => {});
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
    const { text, url } = await startSignupFlow(from);
    if (url) {
      try { await sendUrlButton(from, text, url, "Verify my church"); } catch { await sendTextMessage(from, `${text}\n\n${url}`); }
    } else {
      await sendTextMessage(from, text);
    }
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
      const wantsGiving = reportKey === "giving" || reportKey === "overview";
      const [workspaceContext, liveData, givingSummary, serviceSnapshot, overviewExtras] = link
        ? await Promise.all([
            loadWorkspaceContext(link.workspaceId),
            loadWorkspaceData(link.workspaceId).catch(() => undefined),
            wantsGiving ? getGivingSummary(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
            reportKey === "overview" ? getServiceSnapshot(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
            reportKey === "overview" ? getOverviewExtras(link.workspaceId).catch(() => undefined) : Promise.resolve(undefined),
          ])
        : [undefined, undefined, undefined, undefined, undefined];
      const { text, buttons } = await buildReport(reportKey, { link, session, workspaceContext, liveData, givingSummary, serviceSnapshot, overviewExtras });
      if (buttons?.length) {
        try { await sendInteractiveButtons(from, text, buttons); }
        catch { await sendTextMessage(from, text); }
      } else {
        await sendTextMessage(from, text);
      }
      return;
    }
  }

  // ── Typed-intent router → deterministic flow (AI demotion) ──
  // A plainly-typed task intent starts its rail; the agent below only handles
  // genuine off-script questions. Never overrides an active flow (that returns
  // far above). Seeds obvious params so the flow never re-asks them.
  if (trimmed && link && !session.activeFlow) {
    const t = trimmed.toLowerCase();
    let flow: string | null = null;
    let seed: Record<string, unknown> | undefined;
    if (/\b(register|add|enrol|enroll|sign\s*up)\b/.test(t) && /\b(child|kid|son|daughter|baby)\b/.test(t)) flow = "child_register";
    else if (/\b(check\s*in|checkin)\b/.test(t) && /\b(child|kid|son|daughter|baby)\b/.test(t)) flow = "child_checkin";
    else if (/\bregister\b/.test(t) && /\bevent\b/.test(t)) flow = "event_register";
    else if (/\b(record|log|enter)\b/.test(t) && /\b(giving|tithe|offering|donation|seed)\b/.test(t)) flow = "record_giving";
    else if (/\b(give|giving|tithe|offering|donate|donation|seed|pledge)\b/.test(t)) {
      flow = "give";
      const amt = Number((t.match(/(?:₦|ngn|n)?\s*([\d,]{2,})/)?.[1] ?? "").replace(/,/g, ""));
      if (Number.isFinite(amt) && amt > 0) seed = { amount: Math.round(amt) };
    }
    else if (/\b(pray|prayer)\b/.test(t)) flow = "prayer";
    else if (/\b(baptis|bereave|passed away|new believer|gave (my|his|her) life|discipleship)\b/.test(t)) flow = "life_journey";
    else if (/\b(dedicat(e|ion)|child naming|naming ceremony|pre.?marital|marital counsel|training school)\b/.test(t)) flow = "pastoral_form";
    else if (/\b(pastor|pastoral|counsel|counselling|see a pastor)\b/.test(t)) flow = "pastoral";
    else if (/\bfirst.?timer\b/.test(t) || /\b(new|first.?time)\s+(visitor|guest|comer)\b/.test(t)) flow = "first_timer";
    else if (/\breport (an? )?(issue|fault|problem)\b|\b(broken|leaking|not working|faulty)\b/.test(t)) flow = "issue";
    else if (/\b(join|volunteer|serve)\b/.test(t) && /\b(ministry|department|choir|ushering|media|team|unit)\b/.test(t)) flow = "join";
    if (flow) {
      const out = await startFlow(flow, { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch), seed);
      if (out) { await sendFlowOutput(from, out); return; }
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

    // WS-A: persist the image (private bucket + row) so "save this to my
    // record" genuinely saves. Best-effort — never blocks the reply.
    void persistChatAttachment({ workspaceId: link?.workspaceId ?? null, personId: personId ?? null, kind: "image", buffer, mimeType, caption: trimmed || null });

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

    // WS-A: persist the document (private bucket + row). Best-effort.
    void persistChatAttachment({ workspaceId: link?.workspaceId ?? null, personId: personId ?? null, kind: "document", buffer, mimeType, caption: trimmed || null });

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
    // P0-3 — a returning linked member is greeted per-church, never re-asked
    // for a code; pure greetings get a short welcome-back, not a wall of text.
    if (link && GREETING_ONLY_RE.test(trimmed)) {
      const name = link.userName ? `, ${link.userName}` : "";
      await sendTextMessage(from, `Welcome back${name} 🙏 You're at *${link.workspaceName}* — what can I help you with today?`);
      return;
    }
    // Unlinked / guest: meet the real Chertt — a warm church-focused intro that
    // guides them into onboarding, not the old SME/demo bot.
    if (!link) {
      const guestReply = await runGuestAgent(trimmed, undefined, from);
      if (guestReply) {
        await addToHistory(from, "user", trimmed);
        await addToHistory(from, "assistant", guestReply);
        await sendTextMessage(from, guestReply);
        return;
      }
    }
    // Fallback (no Gemini, or a linked user the agent couldn't serve).
    await addToHistory(from, "user", trimmed);
    const freshSession = await getSession(from);
    let context: CommandExecutionContext;
    if (link) { const [ctx, kb] = await Promise.all([loadWorkspaceContext(link.workspaceId), loadKnowledgeContext(link.workspaceId)]); context = buildWorkspaceCtx(link, ctx, freshSession, undefined, kb); }
    else { context = buildGuestContext(freshSession); }
    const result = await runCherttCommand(trimmed, context, false);
    await handleAiResult(from, result, trimmed, freshSession, link);
  }
}
