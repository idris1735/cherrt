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
import { provisionPersonMembership, ensureVerifiedPerson, listBranchMembers } from "@/lib/services/identity/provisioning";
import { resolveIdentityByPhone, pickActiveMembership } from "@/lib/services/identity/resolver";
import { isAssignRoleTrigger } from "@/lib/services/identity/assign-role-flow";
import { canAssignRole, roleRank, assignableRoles } from "@/lib/services/identity/role-catalog";
import { roleLabel } from "@/lib/services/agent/persona";
import { runAgentQuery, runGuestAgent, getAgentTool, type MediaPart } from "@/lib/services/agent/runtime";
import { toolAccessError } from "@/lib/services/agent/access";
import { menuPromptFor, mainMenuRows, menuItemsForGroup, menuDirectory } from "@/lib/services/agent/menu";
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
import { withWayBack, MENU_BUTTON } from "@/lib/services/flows/direction";
import { listGuardianChildren } from "@/lib/services/children/checkins";
import { confirmMemberEmail } from "@/lib/services/identity/email-verify";
import { getWorkspaceBilling, isSubscriptionActive } from "@/lib/services/billing/subscription";
import { runMenuRead } from "@/lib/services/agent/read-menu";
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

// A guest expressing a CHURCH action or connect intent — every one of these only
// works once they're linked to a church, so (when it isn't phrased as a question)
// it's guided into the connect rail rather than the open-ended agent. Kept to
// church-specific verbs so ordinary chat still reaches the agent.
const GUEST_CONNECT_INTENT_RE = /\b(connect(\s*me)?|join|i\s*attend|attend(ing)?|i'?m a member|a member|my church|our church|prayer|pray(ing|\s*for)?|give|giving|tithe|offering|donate|donation|check.?in|register(ing)?\s+(my\s+)?(child|kid|son|daughter|baby)|see a pastor|pastoral|counsel(l?ing)?|volunteer|serve|ministry|choir|usher(ing)?|visiting|new here)\b/i;

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

// "How it works" — the direction rail's help card. Role-aware: a leader also
// sees leader examples. The full module directory (every option + one line on
// what it does) is sent just before it by sendHelpMenu.
function buildHelpText(link: PhoneLink, session: WhatsAppSession): string {
  const name = link.userName || session.userName;
  const leader = roleRank(link.userRole) >= 2;
  return [
    name ? "💡 *How Chertt works, " + name.split(" ")[0] + "*" : "💡 *How Chertt works*",
    "",
    "1️⃣ Type *menu* (or tap *Open menu*) — pick a section, then what you need.",
    "2️⃣ I guide you one step at a time — just tap or reply.",
    "3️⃣ Type *menu* anytime to stop and come back.",
    "",
    "Or just tell me in your own words — type or send a voice note:",
    "• \"I want to give ₦5,000 tithe\"",
    "• \"Please pray for my mum, she's unwell\"",
    "• \"Check in my daughter\"",
    ...(leader
      ? ["• \"Record today: 120 adults, ₦45k offering\"", "• \"What needs my approval?\""]
      : ["• \"I'd like to join the choir\""]),
    "",
    "⚡ Type *#shortcuts* for quick jumps like *#give* and *#checkin*.",
  ].join("\n");
}

// Guests can't use church modules until they're connected, so their help card
// explains that and offers the two ways in — never "just type it" guides that
// dead-end in "connect to your church first".
const GUEST_HELP_TEXT = [
  "👋 *Here's how I can help*",
  "",
  "*Chertt* is your church on WhatsApp — give, ask for prayer, check kids in, join a ministry, see events and more.",
  "",
  "To start, connect to your church (about a minute):",
  "1️⃣ Tap *Connect my church*",
  "2️⃣ Tell me your name",
  "3️⃣ Send your church's code — or just its name",
  "",
  "Lead a church? Tap *I lead a church* to set it up.",
].join("\n");

const GUEST_HELP_BUTTONS = [
  { id: "guest_member", title: "🔗 Connect my church" },
  { id: "guest_leader", title: "⛪ I lead a church" },
];

async function sendHelpMenu(from: string, session: WhatsAppSession, link: PhoneLink | null): Promise<void> {
  if (!link) {
    try { await sendInteractiveButtons(from, GUEST_HELP_TEXT, GUEST_HELP_BUTTONS, "How can I help?"); }
    catch { await sendTextMessage(from, GUEST_HELP_TEXT + "\n\nReply *connect* to connect to your church."); }
    await addToHistory(from, "assistant", "Sent guest help menu");
    return;
  }
  // 1) Everything this role can do, each with a one-line "what it does".
  await sendTextMessage(from, menuDirectory(link.userRole ?? "member"));
  // 2) How it works + the way in.
  const text = buildHelpText(link, session);
  try {
    await sendInteractiveButtons(from, text, [
      { id: "main_menu", title: "📋 Open menu" },
      { id: "help_give", title: "💰 Give" },
      { id: "help_prayer", title: "🕊️ Prayer" },
    ], "How can I help?");
  } catch {
    await sendTextMessage(from, text);
  }
  await addToHistory(from, "assistant", "Sent church help menu");
}

// Typed-example guides behind the help buttons. Each ends with a way forward:
// a member gets a button that starts the module (plus Main menu); a guest gets
// "Connect my church", since none of these work before connecting.
const HELP_GUIDES: Record<string, { text: string; start?: { id: string; title: string } }> = {
  help_give: {
    text: [
      "*Giving* 🙏",
      "",
      "Just tell me the amount and type, e.g.:",
      "\"I want to give ₦5,000 tithe\"",
      "",
      "I'll send you a secure link to complete it, and record it once it's done.",
    ].join("\n"),
    start: { id: "menu:give", title: "💰 Give now" },
  },
  help_prayer: {
    text: [
      "*Prayer requests* 🕊️",
      "",
      "Tell me what to pray about, e.g.:",
      "\"Please pray for my mother's health\"",
      "",
      "Say it's anonymous if you'd rather not share your name.",
    ].join("\n"),
    start: { id: "menu:prayer", title: "🕊️ Ask for prayer" },
  },
  help_checkin: {
    text: [
      "*Children's check-in* 👶",
      "",
      "Register your child once, then check them in each Sunday:",
      "\"Check in my son Timmy\"",
      "",
      "You'll get a pickup code to show at collection.",
    ].join("\n"),
    start: { id: "menu:checkin", title: "👶 Check in a child" },
  },
  help_firsttimer: {
    text: [
      "*First time at church?* 👋",
      "",
      "Welcome! Tell me about yourself, e.g.:",
      "\"I'm new here, my name is Ada, I came with a friend\"",
      "",
      "I'll let the pastoral team know so they can follow up with you.",
    ].join("\n"),
  },
  help_join: {
    text: [
      "*Join a ministry or department* 🤝",
      "",
      "Tell me which group you'd like to join, e.g.:",
      "\"I'd like to join the choir\" or \"Sign me up for the ushering team\"",
      "",
      "I'll send your request to the department leader for approval.",
    ].join("\n"),
    start: { id: "menu:join_dept", title: "🤝 Join a ministry" },
  },
  help_event: {
    text: [
      "*Events & Programmes* 📅",
      "",
      "Ask me what's coming up or register for something:",
      "\"What events are on this month?\"",
      "\"Register me for the women's conference\"",
      "",
      "I'll confirm your spot and send you the details.",
    ].join("\n"),
    start: { id: "menu:events", title: "📅 See events" },
  },
  help_service: {
    text: [
      "*Record a service* 📝",
      "",
      "After service, tell me the numbers — leaders and pastors can log:",
      "\"Record today: 150 adults, 40 children, ₦55k tithe, ₦30k offering\"",
      "",
      "You can also note the sermon title, first-timers, and salvations.",
    ].join("\n"),
    start: { id: "menu:record_service", title: "📝 Record service" },
  },
};

async function handleHelpButton(from: string, buttonId: string, link: PhoneLink | null): Promise<boolean> {
  const guide = HELP_GUIDES[buttonId];
  if (guide) {
    const out: FlowOutput = link
      ? withWayBack({ type: "buttons", text: guide.text, buttons: guide.start ? [guide.start] : [] })
      : { type: "buttons", text: `${guide.text}\n\n*First:* connect to your church — it takes about a minute.`, buttons: [GUEST_HELP_BUTTONS[0]] };
    await sendFlowOutput(from, out);
    await addToHistory(from, "assistant", guide.text);
    return true;
  }
  // "More help" / "How it works" — re-send the full help menu with buttons
  if (buttonId === "help_more") {
    const session = await getSession(from);
    // resolve link for role-aware help (best-effort; fallback to guest context)
    const { link: resolved } = await resolveActiveLinks(from, session.activeWorkspaceId);
    await sendHelpMenu(from, session, resolved);
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
  // CHQ-001 (Welcome Messages): lead with warmth and what Chertt does, keep the
  // privacy ask to one short line. We can't defer or drop the consent itself —
  // NDPR needs a clear affirmative yes before we store a phone number or message
  // — but it no longer reads as a wall of policy before any welcome.
  const text = [
    "👋 Welcome to *Chertt* — your church, right here on WhatsApp: giving, prayer, events, kids' check-in and more.",
    "",
    "Quick bit before we start: we keep what you share *only* to help your church serve you — never sold, and *stop* opts you out anytime.",
    "",
    "Tap *I agree* and let's go 👇",
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
    "👋 Hi! I'm *Chertt* — your church on WhatsApp: give, ask for prayer, check kids in, join a ministry, see events and more.",
    "",
    "First I'll connect you to your church. So I point you the right way — who are you? Tap below 👇",
    "",
    "_Type *privacy* for how we use your data, or *stop* to opt out._",
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
// same permission machinery that guards execution.
//
// Direction rail: one screen that names the church, lists every section this
// role can use (each row says what's inside), ends with "How it works", and
// reminds them "menu" always brings them back. `lead` prefixes a greeting /
// confirmation (e.g. "You're connected to …") so it arrives as ONE message.
async function sendMainMenu(from: string, link: PhoneLink | null, _page = 1, lead?: string): Promise<void> {
  if (!link) { await sendGuestWelcome(from); return; }
  const role = link.userRole ?? "member";
  const first = link.userName ? link.userName.split(" ")[0] : "";
  const text = [
    ...(lead ? [lead, ""] : []),
    `📋 *Main menu — ${link.workspaceName}*`,
    `Here's everything I can do for you${first ? ", " + first : ""}. Pick a section to see its options 👇`,
    "",
    "_Type *menu* anytime to come back here._",
  ].join("\n");
  try {
    await sendInteractiveList(from, text, "Open menu", mainMenuRows(role), "Menu");
  } catch {
    await sendTextMessage(from, (lead ? lead + "\n\n" : "") + menuDirectory(role));
  }
}

// A group's sub-menu: buttons when ≤3 items (one tap, no modal), else a list.
// Every option shows its one-line "what it does", and there's always a way back.
async function sendGroupMenu(from: string, role: string, group: string, page = 1): Promise<void> {
  const { asButtons, header, items, hasMore } = menuItemsForGroup(role, group, page);
  if (!items.length) { await sendFlowOutput(from, withWayBack({ type: "text", text: "Nothing in this section for you right now." })); return; }
  if (asButtons) {
    const body = `*${header}*\n\n${items.map((i) => `${i.title} — ${i.description}`).join("\n")}\n\nTap one 👇`;
    const buttons = items.map((i) => ({ id: i.id, title: i.title }));
    if (buttons.length < 3) buttons.push({ id: "main_menu", title: "⬅️ Back to menu" });
    try { await sendInteractiveButtons(from, body, buttons, header); }
    catch { await sendTextMessage(from, `${body}\n\n_Type *menu* to go back._`); }
    return;
  }
  const rows = items.map((i) => ({ id: i.id, title: i.title, description: i.description }));
  // ≤ 9 items + one nav row = WhatsApp's 10-row cap. The last page leads back.
  rows.push(hasMore
    ? { id: `grp:${group}:${page + 1}`, title: "More →", description: "The rest of this section" }
    : { id: "main_menu", title: "⬅️ Back to menu", description: "All sections" });
  const body = `*${header}* — tap *Choose* to see each option and what it does 👇\n\n_Type *menu* to go back._`;
  try { await sendInteractiveList(from, body, "Choose", rows, header); }
  catch { await sendTextMessage(from, `${header}:\n` + items.map((i) => `• ${i.title} — ${i.description}`).join("\n")); }
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
    "Tap a button below — *📋 Full menu* shows everything. Or just tell me what you need (type or voice note). 👇",
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
      { id: "main_menu", title: "📋 Full menu" },
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
    await persistWorkspaceAiResult(link.workspaceId, link.userName, result, from);
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
  // Direction rail: a flow's last message (done / cancel) always offers the
  // next step or the way back — never a dead-end.
  if (out.final) out = withWayBack(out);
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

// A one-off reply that must not dead-end (a read, a refusal, a cancel): the text
// plus "🏠 Main menu" (or a "type menu" line when it's too long for buttons).
async function sendWithWayBack(from: string, text: string): Promise<void> {
  await sendFlowOutput(from, withWayBack({ type: "text", text }));
}

// Start child check-in the right way: only the guardian's OWN registered
// children can be checked in (client feedback 2026-09-12 — a free-text name let
// you check in a child who was never registered). If they have none, prompt to
// register first; otherwise start the flow seeded with their children to pick from.
async function startChildCheckin(from: string, link: PhoneLink | null, personId: string | null | undefined, session: WhatsAppSession): Promise<void> {
  const kids = link && personId ? await listGuardianChildren(link.workspaceId, personId) : [];
  if (!kids.length) {
    try {
      await sendInteractiveButtons(from, "You haven't registered any children yet. Let's add one first — then you can check them in. 👶", [{ id: "menu:register_child", title: "🧒 Register a child" }, MENU_BUTTON]);
    } catch { await sendTextMessage(from, "You haven't registered any children yet. Reply *register my child* to add one, then check them in."); }
    return;
  }
  const out = await startFlow("child_checkin", { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch), { myChildren: kids });
  if (out) await sendFlowOutput(from, out);
}

// Start a seat reservation the same way check-in starts: only the guardian's
// OWN registered children can be reserved, so the reservation binds to the
// child's person id (pickup then verifies by identity, not a free-text name).
async function startHoldSeat(from: string, link: PhoneLink | null, personId: string | null | undefined, session: WhatsAppSession): Promise<void> {
  const kids = link && personId ? await listGuardianChildren(link.workspaceId, personId) : [];
  if (!kids.length) {
    try {
      await sendInteractiveButtons(from, "You haven't registered any children yet. Let's add one first — then you can reserve a seat. 👶", [{ id: "menu:register_child", title: "🧒 Register a child" }, MENU_BUTTON]);
    } catch { await sendTextMessage(from, "You haven't registered any children yet. Reply *register my child* to add one, then reserve a seat."); }
    return;
  }
  const out = await startFlow("hold_seat", { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch), { myChildren: kids });
  if (out) await sendFlowOutput(from, out);
}

// Start authorise-pickup the same way check-in starts: only the guardian's OWN
// registered children can be chosen (CHQ-016 — a selection, not a typed name),
// so seed them and handle the "no children yet" case.
async function startAddGuardian(from: string, link: PhoneLink | null, personId: string | null | undefined, session: WhatsAppSession): Promise<void> {
  const kids = link && personId ? await listGuardianChildren(link.workspaceId, personId) : [];
  if (!kids.length) {
    try {
      await sendInteractiveButtons(from, "You haven't registered any children yet. Register a child first, then you can authorise someone to collect them. 👶", [{ id: "menu:register_child", title: "🧒 Register a child" }, MENU_BUTTON]);
    } catch { await sendTextMessage(from, "You haven't registered any children yet. Reply *register my child* to add one, then authorise a pickup."); }
    return;
  }
  const out = await startFlow("add_guardian", { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch), { myChildren: kids });
  if (out) await sendFlowOutput(from, out);
}

// Start assign-role the same way: load the members this actor may reassign and
// the roles they may grant, handle the empty cases, then start the tappable
// flow seeded (was a plain-text numbered list).
async function startAssignRole(from: string, link: PhoneLink, session: WhatsAppSession): Promise<void> {
  const roleOptions = assignableRoles("church").filter((r) => canAssignRole(link.userRole, r));
  if (!roleOptions.length) { await sendWithWayBack(from, "You don't have permission to change roles here."); return; }
  const members = await listBranchMembers(link.workspaceId);
  const candidates = members.filter((m) => roleRank(m.role) <= roleRank(link.userRole));
  if (!candidates.length) { await sendWithWayBack(from, "There's no one here whose role you can change yet."); return; }
  const out = await startFlow("assign_role", { phone: from, link, personId: undefined, session }, (patch) => updateSession(from, patch), { candidates, roleOptions });
  if (out) await sendFlowOutput(from, out);
}

async function handleButtonReply(from: string, buttonId: string, session: WhatsAppSession, link: PhoneLink | null, personId?: string | null): Promise<void> {
  // Help-card buttons: for a linked member, tap straight into the rail instead of
  // a "just type it" guide. Guests (no link) still get the guide (fallback below).
  if (link && buttonId === "help_checkin") { await startChildCheckin(from, link, personId, session); return; }
  const HELP_FLOW: Record<string, string> = { help_give: "give", help_prayer: "prayer" };
  if (link && HELP_FLOW[buttonId]) {
    const out = await startFlow(HELP_FLOW[buttonId], { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
  }
  if (await handleHelpButton(from, buttonId, link)) return;
  if (buttonId === "confirm") { await handleConfirm(from, session, link); return; }
  if (buttonId === "cancel") { await clearPending(from); await sendWithWayBack(from, "Cancelled — nothing was saved. 🙏"); return; }

  // ── Consent gate (must agree before anything is stored/used) ──
  if (buttonId === "guest_consent") {
    if (personId) recordConsent({ personId, source: "whatsapp_first_contact" }).catch(() => {});
    // Explicit agreement opts them back in and clears any prior decline.
    await updateSession(from, { consentDeclined: false });
    await clearOptOut(from).catch(() => {});
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
    await updateSession(from, { consentDeclined: true });
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
    // CHQ-012: registration happens right here, not "somewhere else". Remember the
    // child intent so that, the moment they connect, we start child registration
    // automatically. For safety a parent/guardian registers — never the child.
    await updateSession(from, { guestChildIntent: true });
    await sendInteractiveButtons(from, "Lovely 👨‍👩‍👧 I'll register your child right here. First I need to connect you to your church (for safety, a parent or guardian registers the child — never the child). Do you have your church code?", [
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
    await sendMainMenu(from, target, 1, `✅ You're now in *${target.workspaceName}*.`);
    return;
  }

  // ── Menu button — available to any linked member ──
  if (buttonId === "main_menu") { await sendMainMenu(from, link); return; }

  // ── Group sub-menu (two-level menu): grp:<group>[:<page>] ──
  if (buttonId.startsWith("grp:")) {
    const parts = buttonId.split(":");
    const group = parts[1];
    const page = Number(parts[2]) || 1;
    if (link) await sendGroupMenu(from, link.userRole ?? "member", group, page);
    else await sendGuestWelcome(from);
    return;
  }

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
      // CHQ-012: a guest who came "for my child" registers the child right here,
      // the moment they're connected — no being sent elsewhere.
      if (session.guestChildIntent) {
        await updateSession(from, { guestChildIntent: false });
        const childLink: PhoneLink = {
          phoneNumber: from, userId: null,
          workspaceId: pj.workspaceId, workspaceSlug: pj.slug, workspaceName: pj.name,
          userName: session.userName ?? "", userRole: "member",
        };
        await sendTextMessage(from, `🎉 You're connected to *${pj.name}*! Now let's register your child.`);
        const out = await startFlow("child_register", { phone: from, link: childLink, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
        if (out) { await sendFlowOutput(from, out); return; }
      }
      const joined: PhoneLink = {
        phoneNumber: from, userId: null,
        workspaceId: pj.workspaceId, workspaceSlug: pj.slug, workspaceName: pj.name,
        userName: session.userName ?? "", userRole: "member",
      };
      await sendMainMenu(from, joined, 1, `🎉 You're connected to *${pj.name}*!`);
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
  if (buttonId === "menu_more" || buttonId.startsWith("menu_more:")) {
    const page = Number(buttonId.split(":")[1]) || 2;
    await sendMainMenu(from, link, page);
    return;
  }
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
    "menu:announce": "announce",
    "menu:add_member": "add_member",
    "menu:qr": "qr",
    "menu:record_service": "service_record",
    "menu:volunteer": "volunteer_signup",
    "menu:my_birthday": "set_birthday",
    "menu:lost_found": "lost_found",
    "menu:create_event": "create_event",
    "menu:request_volunteers": "request_volunteers",
    "menu:office_guest": "office_guest",
    "menu:add_classroom": "create_classroom",
    "menu:accept_arrivals": "accept_arrivals",
    "menu:arrive": "arrive",
    "menu:pickup": "pickup",
    "menu:convert_first_timer": "convert_first_timer",
    "menu:join_dept": "join",
  };
  if (link && buttonId === "menu:checkin") { await startChildCheckin(from, link, personId, session); return; }
  if (link && buttonId === "menu:hold_seat") { await startHoldSeat(from, link, personId, session); return; }
  if (link && buttonId === "menu:add_guardian") { await startAddGuardian(from, link, personId, session); return; }
  if (link && buttonId === "menu:assign_role") { await startAssignRole(from, link, session); return; }
  if (link && buttonId === "menu:overview") { buttonId = "rpt:overview"; }
  if (link && MENU_FLOW[buttonId]) {
    const out = await startFlow(MENU_FLOW[buttonId], { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
    if (out) { await sendFlowOutput(from, out); return; }
  }
  // Direct reads — tapping a read row calls the tool and formats it, no agent.
  if (link) {
    const readReply = await runMenuRead(buttonId, agentCtx(link, from, personId ?? undefined));
    if (readReply !== null) { await addToHistory(from, "user", `[tap] ${buttonId}`); await sendWithWayBack(from, readReply); return; }
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
    // Notify the requester keyed off THIS request (survives multiple pending
    // requests); fall back to the session only for rows predating the column.
    const rp = request?.requesterPhone ?? session.pendingApproval?.requesterPhone;
    if (rp && request) { const amt = request.amount ? " (" + fmt(request.amount) + ")" : ""; await sendTextMessage(rp, '🎉 Your request "' + request.title + '"' + amt + " has been approved!"); }
    await clearPending(from); return;
  }

  if (buttonId.startsWith("reject_")) {
    const requestId = buttonId.slice(7);
    const [request] = await Promise.all([getWorkflowRequest(requestId), rejectWorkspaceRequest(requestId)]);
    await sendTextMessage(from, '❌ Rejected: "' + (request?.title ?? "Request") + '"');
    const rp = request?.requesterPhone ?? session.pendingApproval?.requesterPhone;
    if (rp) { await sendTextMessage(rp, '❌ Your request "' + (request?.title ?? "your request") + '" was not approved. Contact your manager for details.'); }
    await clearPending(from); return;
  }

  await sendWithWayBack(from, "I didn't recognise that button — it may be from an older message. Here's the way back. 👇");
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

// A trust-critical question the client keeps asking ("how secure is pickup? what
// if someone forwards my QR/code?"). We KNOW the answer, so we give a sure,
// deterministic one rather than letting the model guess. See the child-safety
// FAQ block in the handler.
const PICKUP_SECURITY_ANSWER =
  "🔒 *Fair question — here's exactly how it works:*\n\n" +
  "The pickup code and QR are *not* the key. A child is only ever released to a *registered guardian*.\n\n" +
  "• If someone forwards the code or QR to another phone, it's useless to them — releasing a child checks that the sender is a guardian *you* registered with pickup permission (verified by their WhatsApp number). A stranger with the code just gets _\"I can only release this child to their registered guardian.\"_\n" +
  "• To let someone else collect (grandma, a nanny), you *add them as an authorised guardian first* — just say *\"add a guardian\"*. You can't hand pickup over by sharing a code.\n" +
  "• Only the children's team can even look a code up, and every release is confirmed.\n\n" +
  "The one thing to protect is your *own* phone: whoever holds your WhatsApp is treated as you (true of any app), which is why our team also does an in-person check at the desk before handing a child over. 🙏";

// ── Seed extractors — pull the details a user already typed so a flow never
// re-asks them (the "wandering" complaint). ──
function extractMinistry(t: string): string | undefined {
  const map: Array<[RegExp, string]> = [
    [/\bchoir\b/, "Choir"],
    [/\bush(?:er|ering|ers)?\b/, "Ushering"],
    [/\bmedia\b/, "Media"],
    [/\b(?:children|kids|sunday school)\b/, "Children"],
    [/\bprayer\b/, "Prayer"],
    [/\bdrama\b/, "Drama"],
    [/\b(?:technical|tech|sound|audio)\b/, "Technical"],
    [/\b(?:protocol|welcome|hospitality)\b/, "Protocol"],
    [/\b(?:worship|praise)\b/, "Worship"],
    [/\bdance\b/, "Dance"],
    [/\b(?:sanitation|sanctuary)\b/, "Sanctuary Keeping"],
    [/\bevangelis(?:m|t)\b/, "Evangelism"],
  ];
  for (const [re, label] of map) if (re.test(t)) return label;
  return undefined;
}

// "55k"/"55,000"/"1.2m" → 55000 / 55000 / 1200000.
function parseAmountToken(tok: string): number {
  const m = tok.replace(/,/g, "").match(/([\d.]+)\s*([km])?/i);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  if (/k/i.test(m[2] ?? "")) n *= 1_000;
  if (/m/i.test(m[2] ?? "")) n *= 1_000_000;
  return Math.round(n);
}

// Parse a typed service report ("record 150 adults, 40 children, ₦55k tithe,
// ₦30k offering") → the fields found (offering = sum of ₦/tithe/offering
// amounts). Returns undefined when there's no headline adult count.
function parseServiceReport(t: string): Record<string, unknown> | undefined {
  const num = (re: RegExp): number | undefined => {
    const m = t.match(re);
    if (!m) return undefined;
    const n = Number(m[1].replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? Math.floor(n) : undefined;
  };
  const adults = num(/([\d,]+)\s*adults?\b/i);
  if (adults == null) return undefined;
  const out: Record<string, unknown> = { adults };
  const children = num(/([\d,]+)\s*(?:children|child|kids?)\b/i);
  if (children != null) out.children = children;
  const firstTimers = num(/([\d,]+)\s*first.?timers?\b/i);
  if (firstTimers != null) out.firstTimers = firstTimers;
  const salvations = num(/([\d,]+)\s*(?:salvations?|decisions?|souls?|converts?)\b/i);
  if (salvations != null) out.salvations = salvations;
  let offering = 0;
  for (const m of t.matchAll(/(?:₦|ngn)\s*([\d.,]+\s*[km]?)|([\d.,]+\s*[km]?)\s*(?:naira|tithe|offering)/gi)) {
    offering += parseAmountToken((m[1] ?? m[2] ?? "").trim());
  }
  if (offering > 0) out.offering = offering;
  out.serviceType = /\bmidweek\b/i.test(t) ? "Midweek" : /\bvigil\b/i.test(t) ? "Vigil" : "Sunday Service";
  return out;
}

// ── Hashtag shortcuts (client request 2026-09-12) — like slash-commands:
// "#give" jumps straight to giving, no picker. Documented in the handoff README.
type HashRoute =
  | { kind: "menu" }
  | { kind: "shortcuts" }
  | { kind: "checkin" }
  | { kind: "flow"; flow: string }
  | { kind: "read"; buttonId: string };
const HASHTAG_ROUTES: Record<string, HashRoute> = {
  menu: { kind: "menu" },
  help: { kind: "menu" },
  shortcuts: { kind: "shortcuts" },
  give: { kind: "flow", flow: "give" },
  gift: { kind: "flow", flow: "give" },
  checkin: { kind: "checkin" },
  signin: { kind: "checkin" },
  pickup: { kind: "flow", flow: "pickup" },
  prayer: { kind: "flow", flow: "prayer" },
  pastor: { kind: "flow", flow: "pastoral" },
  register: { kind: "flow", flow: "child_register" },
  qr: { kind: "flow", flow: "qr" },
  events: { kind: "read", buttonId: "menu:events" },
  giving: { kind: "read", buttonId: "menu:giving_month" },
};
function hashtagHelp(): string {
  // CHQ-005: list each shortcut WITH what it does — the bare "#give · #prayer"
  // list left testers unsure what the shortcuts actually trigger.
  return [
    "⚡ *Shortcuts* — type any of these to jump straight there:",
    "",
    "*#menu* — see everything I can do",
    "*#give* — make a gift or tithe",
    "*#checkin* — check a child into service",
    "*#pickup* — collect a child with your pickup code",
    "*#prayer* — send a prayer request",
    "*#pastor* — ask to speak with a pastor",
    "*#register* — register a child or family member",
    "*#events* — see what's coming up",
    "*#giving* — your giving this month",
    "*#qr* — your personal QR code",
    "*#reset* — start over and clear our chat",
    "",
    "_Type *menu* anytime to see everything else._",
  ].join("\n");
}

// Typed-intent flows whose underlying action is rank-gated. A menu tap is
// already visibility-filtered by role; a typed intent isn't, so the router
// checks access before starting these (see the typed-intent router below).
const FLOW_GATE_TOOL: Record<string, string> = {
  announce: "create_announcement",
  add_member: "add_member",
  create_event: "create_event",
  request_volunteers: "request_volunteers",
  record_giving: "record_giving",
  service_record: "record_service_summary",
  convert_first_timer: "convert_first_timer",
  create_classroom: "create_classroom",
  accept_arrivals: "accept_arrival",
  office_guest: "register_office_guest",
  first_timer: "capture_first_timer",
};

// Deterministic service-report card. Accepts the full get_service_summary shape
// or the lighter ServiceSnapshot; renders only the lines that have data.
function formatServiceReport(s: any): string {
  const date = s.date ?? s.dateLabel ?? "";
  const adults = s.attendanceAdults ?? s.adults;
  const children = s.attendanceChildren ?? s.children;
  const lines = [`📝 *Service report${date ? ` — ${date}` : ""}*`];
  if (s.serviceType) lines.push(s.serviceType);
  const att: string[] = [];
  if (adults != null) att.push(`Adults ${adults}`);
  if (children != null) att.push(`Children ${children}`);
  if (att.length) lines.push(`👥 ${att.join(" · ")}${s.childrenCheckedIn != null ? ` (checked in ${s.childrenCheckedIn})` : ""}`);
  if (s.firstTimers != null) lines.push(`👋 First-timers: ${s.firstTimers}`);
  if (s.salvations != null) lines.push(`✝️ Salvations: ${s.salvations}`);
  if (s.offering != null) lines.push(`💰 Offering: ₦${Number(s.offering).toLocaleString("en-NG")}`);
  if (s.preacher || s.topic) lines.push(`🎤 ${[s.preacher, s.topic].filter(Boolean).join(" — ")}`);
  if (lines.length === 1) lines.push("Recorded, but no details captured yet.");
  return lines.join("\n");
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

// Requirement 4 of the P0 sweep: the webhook route (src/app/api/whatsapp/webhook/route.ts)
// swallows any exception from this function and still returns 200 to Meta —
// by design, so Meta doesn't retry-storm a bad payload — but that means an
// uncaught throw anywhere below (a DB call, a tool handler, etc.) previously
// resulted in total silence: the user's message vanishes with no reply at
// all, which reads exactly like the reported "stuck" bug. This thin wrapper
// guarantees SOMETHING is always sent back.
export async function processWhatsAppMessage(message: IncomingMessage): Promise<void> {
  try {
    await processWhatsAppMessageInner(message);
  } catch (err) {
    console.error("[whatsapp] unhandled error processing message:", err instanceof Error ? err.stack ?? err.message : err);
    await sendTextMessage(message.from, "Sorry — something went wrong on my end. Please try that again in a moment. 🙏").catch(() => {});
  }
}

async function processWhatsAppMessageInner(message: IncomingMessage): Promise<void> {
  const { from, type } = message;
  const claimed = await claimWhatsAppMessage(message.messageId, from, type);
  if (!claimed) return;

  // Every inbound number is a known, number-verified (L1) person — the message
  // proves control of the number. Best-effort; never blocks handling.
  await ensureVerifiedPerson(from).catch(() => null);

  // Re-engagement clears opt-out: any message from an opted-out number is the
  // person opting back in (Slice B). Best-effort.
  const session = await getSession(from);
  const { allLinks, link: resolvedLink, personId } = await resolveActiveLinks(from, session.activeWorkspaceId);
  let link = resolvedLink;
  const trimmed = (message.text ?? "").trim();

  // A linked member messaging in is a clear re-engagement → opt them back in, so
  // our replies aren't suppressed. A guest's opt-out is NOT silently reversed:
  // it's cleared only when they explicitly agree again (see the consent gate).
  if (link) await clearOptOut(from).catch(() => null);

  // Consent gate — a guest who previously declined ("No thanks" / "stop") sees it
  // again on every return, and is never silently processed. A consent response
  // itself (I agree / privacy / No thanks / stop) is let through to its handler.
  const isConsentResponse =
    message.buttonReplyId === "guest_consent" ||
    message.buttonReplyId === "guest_privacy" ||
    message.buttonReplyId === "guest_optout" ||
    (!!trimmed && /^((i\s*)?agree\b|(yes,?\s*)?i\s*agree|privacy|stop|unsubscribe|remove me)/i.test(trimmed));
  if (!link && session.consentDeclined && !isConsentResponse) {
    await sendConsentGate(from);
    return;
  }

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

  // ── Universal escape hatch — cancel/exit/quit/menu/start over always win ──
  // Root-cause fix for the reported bug: "there are times when we stop
  // talking and Chertt will fail to send me the menu or to exit the chat."
  // A pause can leave the conversation in ANY ONE of several independent
  // sticky states — an active flow-engine rail, an agent tool call awaiting
  // YES/NO, the single-shot creator's confirm gate, or a pending approval —
  // and each used to have its own (incomplete) escape logic:
  //   - mid-flow, the engine's own CANCEL_RE (flows/engine.ts) caught these
  //     words and cleared activeFlow, but for "menu" it only replied "tap
  //     Menu whenever you're ready" instead of actually sending the menu —
  //     so the user had to ask a second time.
  //   - pendingAgentAction only recognised "no/n/cancel"; "exit"/"quit" fell
  //     through to the free-text agent while the pending action stayed live,
  //     so a later unrelated "yes" could fire a stale tool call.
  //   - pendingConfirmation/pendingApproval were left untouched entirely if
  //     "menu" matched first (see MENU_RE below), for the same reason.
  // Handling all four states in one place, before any of that per-state logic
  // runs, guarantees these five words always get the user all the way out —
  // never just one layer down — and that "menu"/"start over" hands back the
  // actual menu in the same turn.
  const ESCAPE_RE = /^(cancel|exit|quit|menu|start over)$/i;
  const hasStickyState = Boolean(
    session.activeFlow || session.pendingAgentAction || session.pendingConfirmation || session.pendingApproval
      || session.onboarding,
  );
  // The "🏠 Main menu" button (offered at the end of every flow and in every
  // sub-menu) is the same escape when tapped from an older message mid-flow.
  const tappedMenu = message.buttonReplyId === "main_menu";
  if (hasStickyState && (tappedMenu || (!message.buttonReplyId && trimmed && ESCAPE_RE.test(trimmed)))) {
    await updateSession(from, {
      activeFlow: undefined,
      pendingAgentAction: undefined,
      pendingConfirmation: undefined,
      pendingApproval: undefined,
      onboarding: undefined,
    });
    await addToHistory(from, "user", tappedMenu ? "[tap] main_menu" : trimmed);
    if (tappedMenu || /^(menu|start over)$/i.test(trimmed)) {
      if (link) await sendMainMenu(from, link);
      else await sendGuestWelcome(from);
    } else {
      await sendWithWayBack(from, "Cancelled — nothing was saved. 🙏");
    }
    return;
  }

  // ── Hashtag shortcuts — an explicit "#give"/"#checkin" jumps straight to the
  // action, bypassing any active flow (client request 2026-09-12). #reset is
  // handled above. Unknown "#something" lists the available shortcuts.
  if (!message.buttonReplyId && /^#[a-z]/i.test(trimmed)) {
    const key = trimmed.slice(1).toLowerCase().replace(/[^a-z]/g, "");
    const route = HASHTAG_ROUTES[key];
    if (route) {
      if (session.activeFlow || session.onboarding) await updateSession(from, { activeFlow: undefined, onboarding: undefined });
      if (route.kind === "menu") { if (link) await sendMainMenu(from, link); else await sendGuestWelcome(from); return; }
      if (route.kind === "shortcuts") { await sendTextMessage(from, hashtagHelp()); return; }
      if (!link) { await sendGuestWelcome(from); return; } // member actions need a church link
      if (route.kind === "checkin") { await startChildCheckin(from, link, personId, session); return; }
      if (route.kind === "read") {
        const reply = await runMenuRead(route.buttonId, agentCtx(link, from, personId ?? undefined));
        if (reply) { await sendWithWayBack(from, reply); return; }
      }
      if (route.kind === "flow") {
        const gateTool = FLOW_GATE_TOOL[route.flow] ? getAgentTool(FLOW_GATE_TOOL[route.flow]) : null;
        if (gateTool) {
          const denied = toolAccessError(gateTool, { workspaceId: link.workspaceId, role: link.userRole as Role });
          if (denied) { await sendWithWayBack(from, denied); return; }
        }
        const out = await startFlow(route.flow, { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
        if (out) { await sendFlowOutput(from, out); return; }
      }
    }
    await sendTextMessage(from, hashtagHelp());
    return;
  }

  // ── In-progress task flow (flow engine) ──
  // An active rail owns the turn — text OR button tap — for members AND guests,
  // so it wins over the ad-hoc join-code / admin-claim matchers below. Global
  // guards that must always win (message-claim, welcome/consent, risk triage,
  // #reset, platform admin, multi-church disambiguation, the escape hatch
  // above) all return above this. Opt-out keywords still escape (they fall
  // through to the handler below).
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
    // A bare 8-char code or @username is looked up for ANY unlinked sender — so a
    // returning visitor who simply types their church code gets connected, not
    // only a brand-new one or someone who just tapped "Send my code". The old
    // !session.welcomed/awaitingJoinCode gate silently dropped a typed code and
    // let it fall through to the agent (QA defect: "non recognition of church
    // code"). Lookup is indexed and confirm-first, so attempting it is cheap.
    const bareCode = trimmed.match(/^([a-z0-9]{8})$/i);
    // P2-2: a bare @username works like a bare code (confirm-first).
    const bareUsername = trimmed.match(/^@([a-z0-9_]{3,20})$/i);
    const identifier = prefixed?.[1] ?? bareCode?.[1] ?? bareUsername?.[1] ?? null;
    const explicitUsername = prefixed && /^join[\s-]?@/i.test(trimmed) ? prefixed[1] : (bareUsername?.[1] ?? null);
    // A plain 8-char word (no JOIN/@ prefix) is the ambiguous case: we still look
    // it up, but on a MISS we only show the "couldn't find" help when the sender
    // is clearly sending a code (explicit JOIN/@, first contact, or we just asked
    // for one) — so an ordinary 8-letter word typed mid-chat isn't hijacked by a
    // dead-end reply (preserves the 2026-07-18 audit intent).
    const explicitCodeAttempt = !!prefixed || !!bareUsername || !session.welcomed || !!session.awaitingJoinCode;
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
          const joined: PhoneLink = {
            phoneNumber: from, userId: null,
            workspaceId: workspace.id, workspaceSlug: workspace.slug, workspaceName: workspace.name,
            userName: session.userName ?? "", userRole: "member",
          };
          await sendMainMenu(from, joined, 1, `🎉 Welcome to *${workspace.name}* — you're in!`);
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
      if (explicitCodeAttempt) {
        await sendTextMessage(from, "I couldn't find a church with that code or username — check with your admin, or just tell me your church's name.");
        return;
      }
      // A bare 8-char word that matched no church and wasn't an explicit code
      // attempt — fall through to normal routing rather than dead-ending chat.
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
          await sendTextMessage(from, `Welcome to *${claimed.workspaceName}* — you're set up as the admin. Type *menu* to see everything you can run from here, or just tell me what you need.`);
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
          : null; // assign-role now runs on the flow engine (see startAssignRole)
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
  // P0-3 + direction rail — a returning linked member saying hi is greeted
  // per-church and handed the menu in the same message (never re-asked for a
  // code, never left at an open "what can I help you with?").
  if (link && GREETING_ONLY_RE.test(trimmed)) {
    const name = link.userName ? `, ${link.userName}` : "";
    // A fresh start: drop any stale YES/NO proposal so a later stray "yes" can't fire it.
    if (session.pendingAgentAction) await updateSession(from, { pendingAgentAction: undefined });
    await addToHistory(from, "user", trimmed);
    await sendMainMenu(from, link, 1, `Welcome back${name} 🙏 You're at *${link.workspaceName}*.`);
    return;
  }
  // Typed consent (for guests who type instead of tapping the gate button).
  if (!link && /^(i\s*)?agree\b.*$|^(yes,?\s*)?i\s*agree$/i.test(trimmed)) {
    if (personId) recordConsent({ personId, source: "whatsapp_first_contact" }).catch(() => {});
    // Explicit agreement opts them back in and clears any prior decline.
    await updateSession(from, { consentDeclined: false });
    await clearOptOut(from).catch(() => {});
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
    if (!link) await updateSession(from, { consentDeclined: true });
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
      await sendWithWayBack(from, "No problem — cancelled. Nothing was done. 🙏");
      return;
    }
  }

  if (/^cancel$/i.test(trimmed)) {
    if (session.onboarding) { await cancelOnboardingFlow(from); await sendWithWayBack(from, "Cancelled — nothing was saved. 🙏"); return; }
    await clearPending(from); await sendWithWayBack(from, "Cancelled — nothing was saved. 🙏"); return;
  }
  if (/^(confirm|yes)$/i.test(trimmed) && session.pendingConfirmation) { await handleConfirm(from, session, link); return; }
  if (/^no$/i.test(trimmed)) {
    if (session.pendingConfirmation) { await clearPending(from); await sendWithWayBack(from, "No problem — cancelled. Nothing was done. 🙏"); }
    else { await sendWithWayBack(from, "Got it. Pick something else from the menu, or just tell me. 🙏"); }
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
      await startAssignRole(from, link, session);
    } else {
      await sendWithWayBack(from, "Only branch admins can change roles.");
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

  // ── Service report (deterministic — attendance/offering, never the agent) ──
  // "service report for last Sunday", "how was the service", "last week's
  // attendance". A READ, not "record service" — so it must beat both the give
  // matcher (the word "give" in "give me the report") and the wandering agent.
  if (trimmed && link
    && !/\b(record|log|submit|enter)\b/.test(trimmed.toLowerCase())
    && (/\bservice (report|summary)\b/i.test(trimmed)
      || /\blast (sunday|week)('?s)? (service|report|summary|attendance)\b/i.test(trimmed)
      || /\bhow (was|did)( last)? (sunday|the service)\b/i.test(trimmed))) {
    if (roleRank(link.userRole) < 2) {
      await sendTextMessage(from, "Service reports are for church leaders — please ask a leader or admin.");
      return;
    }
    const snap = await getServiceSnapshot(link.workspaceId).catch(() => null);
    if (!snap?.dateLabel) {
      await sendTextMessage(from, "No service has been recorded yet. A leader can add one from *Menu → Church ops → Record service*.");
      return;
    }
    const tool = getAgentTool("get_service_summary");
    const full = tool
      ? ((await tool.handler({ date: snap.dateLabel }, agentCtx(link, from, personId ?? undefined)).catch(() => null)) as any)
      : null;
    await sendTextMessage(from, formatServiceReport(full && full.found !== false ? full : snap));
    return;
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

  // ── Child-safety FAQ (deterministic answer — a trust question, not a rail) ──
  // Client 2026-09-12: "how secure is this? what if someone takes my phone and
  // forwards this qr and code to receive the child?" — the word "qr" wrongly
  // opened the QR-codes menu. A security question deserves a sure answer, and
  // this must run before the typed-intent router below.
  if (trimmed && !session.activeFlow
    && /\b(secure|security|safe|safety|steal|stole|stolen|kidnap|wrong person|someone else|somebody else|a stranger|not me|take(s|n)? my phone|forward|hack)\b/i.test(trimmed)
    && /\b(pick.?up|collect|check.?in|child|kid|son|daughter|baby|qr|code|pass)\b/i.test(trimmed)) {
    await sendTextMessage(from, PICKUP_SECURITY_ANSWER);
    return;
  }

  // ── Typed-intent router → deterministic flow (AI demotion) ──
  // A plainly-typed task intent starts its rail; the agent below only handles
  // genuine off-script questions. Never overrides an active flow (that returns
  // far above). Seeds obvious params so the flow never re-asks them.
  if (trimmed && link && !session.activeFlow) {
    const t = trimmed.toLowerCase();
    let flow: string | null = null;
    let seed: Record<string, unknown> | undefined;
    // When the typed intent already names the specific choice, jump past that
    // flow's picker (don't re-ask what they said) — see post_phase4 UX issue B.
    let startStep: string | undefined;
    if (/\b(register|add|enrol|enroll|sign\s*up)\b/.test(t) && /\b(child|kid|son|daughter|baby)\b/.test(t)) flow = "child_register";
    else if (/\b(check\s*in|checkin)\b/.test(t) && /\b(child|kid|son|daughter|baby)\b/.test(t)) flow = "child_checkin";
    else if (/\b(reserve|hold|pre.?check)\b/.test(t) && /\b(seat|spot|child|kid)\b/.test(t)) flow = "hold_seat";
    else if (/\b(arrived|we'?re here|we are here)\b/.test(t)) flow = "arrive";
    // Authorise a co-parent/nanny to collect — must be checked BEFORE pickup
    // ("authorise my wife to pick up my child" also matches pickup below).
    else if (/\b(add|register|authori[sz]e?)\b[^?]*\bguardian\b/.test(t)
      || (/\b(authori[sz]e?|allow|let)\b/.test(t) && /\b(collect|pick.?up)\b/.test(t) && /\b(child|kid|son|daughter|baby|wife|husband|mum|mother|dad|father|nanny|grandma|grandmother|grandpa|grandfather|my)\b/.test(t))) flow = "add_guardian";
    else if (/\b(collect|pick.?up|picking up)\b.*\b(child|kid|son|daughter)\b|\bpickup code\b/.test(t)) flow = "pickup";
    else if (/\bconvert\b.*\b(first.?timer|visitor)\b|\b(first.?timer|visitor)\b.*\b(join|become|convert)\b.*\bmember\b/.test(t)) flow = "convert_first_timer";
    else if (/\bregister\b/.test(t) && /\bevent\b/.test(t)) flow = "event_register";
    else if (/\b(create|new|set up|add)\b/.test(t) && /\bevent\b/.test(t)) flow = "create_event";
    else if (/\b(record|log|submit)\b/.test(t) && (/\b(service|attendance|sunday report|service report)\b/.test(t) || /\b\d+\s*adults?\b/i.test(t))) {
      flow = "service_record";
      // If they typed the numbers ("record 150 adults, ₦55k tithe, ₦30k offering"),
      // seed them and jump straight to the confirm — one tap to save.
      const parsed = parseServiceReport(t);
      if (parsed) { seed = parsed; startStep = "confirm"; }
    }
    else if (/\b(record|log|enter)\b/.test(t) && /\b(giving|tithe|offering|donation|seed)\b/.test(t)) {
      flow = "record_giving";
      const amt = parseAmountToken((t.match(/(?:₦|ngn)?\s*([\d.,]+\s*[km]?)/)?.[1] ?? ""));
      const gt = /\btithe\b/.test(t) ? "tithe" : /\boffering\b/.test(t) ? "offering" : /\bdonation\b/.test(t) ? "donation" : /\bpledge\b/.test(t) ? "pledge" : undefined;
      if (amt > 0) { seed = gt ? { amount: amt, givingType: gt } : { amount: amt }; startStep = gt ? "donor" : "giving_type"; }
    }
    // "give me the report/service/..." means SHOW me — not the giving rail. Only
    // a money word (or an explicit give phrase/amount) starts the giving flow.
    else if (
      (!/\bgive (me|us|him|her|them|the report|the service|the summary|the list|the members|the breakdown)\b/.test(t)
        && /\b(giving|tithe|offering|donate|donation|seed|pledge)\b/.test(t))
      || /\bwant to give\b|\bi'?ll give\b|\bgive ₦?\s?\d/.test(t)
    ) {
      flow = "give";
      const amt = Number((t.match(/(?:₦|ngn|n)?\s*([\d,]{2,})/)?.[1] ?? "").replace(/,/g, ""));
      if (Number.isFinite(amt) && amt > 0) seed = { amount: Math.round(amt) };
    }
    else if (/\b(pray|prayer)\b/.test(t)) flow = "prayer";
    // Life journeys — seed the type and skip the picker.
    else if (/\bbapti[sz]/.test(t)) { flow = "life_journey"; seed = { journeyType: "baptism" }; startStep = "detail"; }
    else if (/\b(new believer|gave (my|his|her) life|born again)\b/.test(t)) { flow = "life_journey"; seed = { journeyType: "discipleship" }; startStep = "detail"; }
    else if (/\b(bereave|bereavement|passed away|lost (my|our))\b/.test(t)) { flow = "life_journey"; seed = { journeyType: "bereavement" }; startStep = "detail"; }
    // Pastoral forms — seed the form type and skip the picker.
    else if (/\bbaby dedicat|\bdedicate (my )?(baby|child)\b/.test(t)) { flow = "pastoral_form"; seed = { formType: "baby_dedication", formLabel: "Baby Dedication" }; startStep = "subject_name"; }
    else if (/\b(child naming|naming ceremony)\b/.test(t)) { flow = "pastoral_form"; seed = { formType: "child_naming", formLabel: "Child Naming" }; startStep = "subject_name"; }
    else if (/\bhouse dedicat/.test(t)) { flow = "pastoral_form"; seed = { formType: "house_dedication", formLabel: "House Dedication" }; startStep = "subject_name"; }
    else if (/\bpre.?marital|marital counsel|marriage counsel/.test(t)) { flow = "pastoral_form"; seed = { formType: "pre_marital", formLabel: "Pre-Marital Counselling" }; startStep = "subject_name"; }
    else if (/\btraining school\b/.test(t)) { flow = "pastoral_form"; seed = { formType: "training_school", formLabel: "Training School" }; startStep = "subject_name"; }
    else if (/\b(dedicat(e|ion)|naming|form)\b/.test(t) && /\bpastoral\b/.test(t)) flow = "pastoral_form";
    // Require a care-intent, not the bare word "pastor" — "is pastor preaching
    // Sunday?" must NOT open a pastoral-care request.
    else if (/\bsee a pastor\b|\bpastoral care\b|\bcounsel(l?ing)?\b|\b(see|need|want|speak to|speak with|talk to|meet|book|request|arrange)\b[^.?!]*\bpastor\b/.test(t)) flow = "pastoral";
    else if (/\bfirst.?timer\b/.test(t) || /\b(new|first.?time)\s+(visitor|guest|comer)\b/.test(t)) flow = "first_timer";
    else if (/\breport (an? )?(issue|fault|problem)\b|\b(broken|leaking|not working|faulty)\b/.test(t)) flow = "issue";
    else if (/\b(announce|announcement|broadcast)\b/.test(t)) flow = "announce";
    else if (/\b(add|register)\b/.test(t) && /\bmember\b/.test(t)) flow = "add_member";
    // A QR *request*, not any sentence mentioning "qr" — needs a request shape.
    else if (/^(the )?qr( codes?)?\b/.test(t) || /\b(send|show|share|get|need|want|give me)\b[^?]{0,25}\bqr\b/.test(t)) flow = "qr";
    // Leader broadcast ("we need people to join the ushering team") must win
    // over the personal join rule below — check it first and match "people to
    // join/serve/help", not just the literal word "volunteers".
    else if (/\b(need|request|call for|looking for|recruit)\b/.test(t)
      && (/\bvolunteers?\b/.test(t) || /\bpeople to (join|serve|help)\b/.test(t) || /\bmore (hands|help|ushers|servers|singers|volunteers)\b/.test(t))) flow = "request_volunteers";
    else if (/\b(join|volunteer|serve)\b/.test(t) && /\b(ministry|department|choir|ushering|media|team|unit)\b/.test(t)) {
      flow = "join";
      // "join the choir" → seed the ministry and skip straight to confirm.
      const dept = extractMinistry(t);
      if (dept) { seed = { department: dept }; startStep = "confirm"; }
    }
    else if (/\b(volunteer|serve|help out)\b/.test(t)) flow = "volunteer_signup";
    else if (/\bmy birthday\b|\bbirthday is\b|\bset .*birthday\b/.test(t)) flow = "set_birthday";
    else if (/\blost (and|&) found\b|\b(i )?(lost|found)\b.*\b(item|phone|bag|wallet|keys|something)\b/.test(t)) flow = "lost_found";
    else if (/\b(sign.?in|office)\b/.test(t) && /\b(visitor|guest)\b/.test(t)) flow = "office_guest";
    else if (/\b(add|create|new|set up)\b/.test(t) && /\bclass\s?room\b/.test(t)) flow = "create_classroom";
    else if (/\baccept\b.*\b(arrival|child|kid|class)\b|\barrivals\b/.test(t)) flow = "accept_arrivals";

    // Directness ≠ deafness. A QUESTION ("how secure is this?", "what if someone
    // forwards my qr and code?", "can anyone else collect?") must NEVER trigger
    // an action rail just because it contains a keyword like qr/give/pastor.
    // Drop the match and let the answer path (deterministic FAQ above, else the
    // agent) handle it. (Client 2026-09-12: a security question opened QR codes.)
    const isQuestion = /\?\s*$/.test(trimmed)
      || /^(how|what|why|who|whose|when|where|which|is|are|am|was|were|do|does|did|can|could|should|would|will|shall|may|might|has|have|had|if)\b/i.test(t)
      || /\bwhat if\b/i.test(t);
    if (isQuestion) { flow = null; seed = undefined; startStep = undefined; }

    if (flow === "child_checkin") { await startChildCheckin(from, link, personId, session); return; }
    if (flow === "hold_seat") { await startHoldSeat(from, link, personId, session); return; }
    if (flow === "add_guardian") { await startAddGuardian(from, link, personId, session); return; }
    if (flow) {
      // A menu tap is already visibility-gated (a member never sees the row); a
      // TYPED intent is not, so gate rank-gated flows up front — don't walk a
      // member through several turns only to reject them at the final step.
      const gateTool = FLOW_GATE_TOOL[flow] ? getAgentTool(FLOW_GATE_TOOL[flow]) : null;
      if (gateTool) {
        const denied = toolAccessError(gateTool, { workspaceId: link.workspaceId, role: link.userRole as Role });
        if (denied) { await sendWithWayBack(from, denied); return; }
      }
      const out = await startFlow(flow, { phone: from, link, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch), seed, startStep);
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
    // Unlinked / guest: a clear CHURCH action or connect intent (prayer, giving,
    // joining a ministry, "connect me", registering a child...) only works once
    // they're linked to a church — so, when it isn't phrased as a question, it's
    // guided straight into the deterministic connect rail (ordered, tappable
    // who-are-you → name → code) instead of the open-ended agent, which previously
    // just chatted and left the guest with no next step (QA defects: "flows not
    // intuitive", "no clear direction", "can't get past the start"). Questions and
    // ordinary chat still get a real answer from the guest agent.
    if (!link) {
      const looksLikeQuestion = /\?\s*$/.test(trimmed)
        || /^(how|what|why|who|whose|when|where|which|is|are|am|was|were|do|does|did|can|could|should|would|will|shall|may|might|has|have|had|if)\b/i.test(trimmed);
      if (!looksLikeQuestion && GUEST_CONNECT_INTENT_RE.test(trimmed)) {
        await addToHistory(from, "user", trimmed);
        const out = await startFlow("guest_connect", { phone: from, link: null, personId: personId ?? undefined, session }, (patch) => updateSession(from, patch));
        if (out) { await sendFlowOutput(from, out); return; }
        await sendGuestWelcome(from);
        return;
      }
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
