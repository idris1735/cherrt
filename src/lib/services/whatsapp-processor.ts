import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
  deductDemoBalance,
  type WhatsAppSession,
} from "@/lib/services/whatsapp-session";
import { sendTextMessage, downloadMedia } from "@/lib/services/whatsapp";
import { runCherttCommand, type CommandExecutionContext } from "@/lib/services/ai-service";
import { formatAiResult } from "@/lib/services/whatsapp-formatter";

export type IncomingMessage = {
  from: string;
  type: "text" | "image" | "document" | "audio" | "unknown";
  text?: string;
  mediaId?: string;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app";

// Matches "I'm Idris", "My name is Idris", "Call me Idris"
const NAME_INTRO_RE = /^(?:i(?:'m| am)|my name is|call me)\s+([a-z][a-z\s'-]{1,30})/i;

function extractName(text: string): string | null {
  const match = NAME_INTRO_RE.exec(text.trim());
  if (!match) return null;
  const raw = (match[1] ?? "").trim().split(/\s+/).slice(0, 3).join(" ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function buildWelcomeMessage(demoBalance: number): string {
  const balance = `₦${demoBalance.toLocaleString()}`;
  return [
    `👋 *Welcome to Chertt!*`,
    ``,
    `You're connected as a *Guest* — you don't have a Chertt workspace yet.`,
    ``,
    `*Your demo account includes:*`,
    `• Demo balance: *${balance}*`,
    `• Full access to all Chertt features`,
    `• AI that thinks like an ops lead, finance desk, and executive assistant`,
    ``,
    `*What you can do right now:*`,
    `• Draft letters, memos, and invoices`,
    `• Raise and approve requests`,
    `• Log expenses and petty cash (deducted from your demo balance)`,
    `• Report facility issues`,
    `• Check inventory`,
    `• Create polls and surveys`,
    `• Ask anything — Chertt handles it all`,
    ``,
    `*Try saying:*`,
    `_"Draft a payment request for ₦50,000 for office supplies"_`,
    `_"Log an expense of ₦15,000 for transportation"_`,
    `_"What can Chertt do for my business?"_`,
    ``,
    `*Ready to set up your own workspace?*`,
    `Sign up here: ${APP_URL}/auth/sign-in`,
    ``,
    `Go ahead — send your first request! 🚀`,
  ].join("\n");
}

function buildDemoContext(session: WhatsAppSession): string {
  const name = session.userName ? `The user's name is ${session.userName}.` : "The user hasn't shared their name yet.";
  return [
    `Channel: WhatsApp. User is messaging via WhatsApp, not the web app.`,
    `User status: Guest (not yet onboarded). Treat as owner-level for demo purposes.`,
    name,
    `Demo balance: ₦${session.demoBalance.toLocaleString()} remaining. Mention the updated balance when an expense or request with an amount is processed.`,
    `Conversation awareness: If the user is chatting, greeting, or asking a general question — respond warmly and naturally. Do NOT create documents or artifacts for casual conversation. Use artifactKind "none" for anything that is not a clear work request.`,
    `If the user introduces themselves by name, acknowledge it warmly. Use their name in document closings and records.`,
    `Occasionally (not every message) encourage signing up: ${APP_URL}/auth/sign-in`,
  ].join(" ");
}

function buildContext(
  session: WhatsAppSession,
  mediaDataUrl?: string,
): CommandExecutionContext {
  const history = session.history.map((entry) => ({
    speaker: entry.role === "user" ? "user" : "assistant",
    text: entry.text,
  }));

  const memoryParts: string[] = [buildDemoContext(session)];
  if (mediaDataUrl) memoryParts.push(`Attached image: ${mediaDataUrl}`);

  return {
    role: "owner",
    userName: session.userName,
    history,
    memoryContext: memoryParts.join("\n\n"),
  };
}

export async function processWhatsAppMessage(message: IncomingMessage): Promise<void> {
  const { from, type } = message;
  const session = await getSession(from);
  const trimmed = (message.text ?? "").trim();

  // First contact — send welcome and mark as welcomed
  if (!session.welcomed) {
    await updateSession(from, { welcomed: true });
    await sendTextMessage(from, buildWelcomeMessage(session.demoBalance));
    return;
  }

  // Extract name from introductions and store for future context
  if (trimmed && !session.userName) {
    const name = extractName(trimmed);
    if (name) await updateSession(from, { userName: name });
  }

  // 1. CANCEL keyword
  if (/^cancel$/i.test(trimmed)) {
    await clearPending(from);
    await sendTextMessage(from, "Cancelled.");
    return;
  }

  // 2. CONFIRM/YES keyword — re-run pending command with confirmed=true
  if (/^(confirm|yes)$/i.test(trimmed) && session.pendingConfirmation) {
    const { originalPrompt } = session.pendingConfirmation;
    await clearPending(from);
    const freshSession = await getSession(from);
    const result = await runCherttCommand(originalPrompt, buildContext(freshSession), true);
    if (result.pendingConfirmation) {
      await updateSession(from, {
        pendingConfirmation: {
          originalPrompt,
          artifactKind: result.pendingConfirmation.actionKey ?? "",
          previewTitle: result.pendingConfirmation.previewTitle ?? "",
        },
      });
    }
    if (result.generatedRequest) {
      await updateSession(from, {
        pendingApproval: {
          requestId: result.generatedRequest.id,
          requestTitle: result.generatedRequest.title,
        },
      });
    }
    const amount = result.generatedExpenseEntry?.amount ?? result.generatedRequest?.amount;
    if (amount) await deductDemoBalance(from, amount);

    const replyText = formatAiResult(result).text || "Something went wrong. Please try again.";
    await sendTextMessage(from, replyText);
    await addToHistory(from, "assistant", replyText);
    return;
  }

  // 3. APPROVE keyword
  if (/^approve$/i.test(trimmed) && session.pendingApproval) {
    await clearPending(from);
    await sendTextMessage(from, "Approved. The requester will be notified.");
    return;
  }

  // 4. REJECT keyword
  if (/^reject\b/i.test(trimmed) && session.pendingApproval) {
    const reason = trimmed.replace(/^reject\s*/i, "").trim();
    const { requestTitle } = session.pendingApproval;
    await clearPending(from);
    const rejectMsg = reason
      ? `Rejected: "${requestTitle}". Reason: ${reason}`
      : `Rejected: "${requestTitle}".`;
    await sendTextMessage(from, rejectMsg);
    return;
  }

  // 5. Audio — not supported
  if (type === "audio") {
    await sendTextMessage(from, "Voice messages aren't supported yet. Please type your request.");
    return;
  }

  // 6. No usable content
  if (!trimmed && !message.mediaId) {
    await sendTextMessage(from, "I didn't understand that. Please type your request.");
    return;
  }

  // 7. Download media if present
  let mediaDataUrl: string | undefined;
  if (message.mediaId && (type === "image" || type === "document")) {
    try {
      const { buffer, mimeType } = await downloadMedia(message.mediaId);
      mediaDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch {
      await sendTextMessage(from, "Sorry, I couldn't download that file. Please try again.");
      return;
    }
  }

  const prompt = trimmed || `[${type} attachment]`;

  // 8. Add user message to history
  await addToHistory(from, "user", prompt);

  // 9. Call AI with full demo context
  const freshSession = await getSession(from);
  const result = await runCherttCommand(prompt, buildContext(freshSession, mediaDataUrl), false);

  // 10. Store pending states
  if (result.pendingConfirmation) {
    await updateSession(from, {
      pendingConfirmation: {
        originalPrompt: prompt,
        artifactKind: result.pendingConfirmation.actionKey ?? "",
        previewTitle: result.pendingConfirmation.previewTitle ?? "",
      },
    });
  }

  if (result.generatedRequest) {
    await updateSession(from, {
      pendingApproval: {
        requestId: result.generatedRequest.id,
        requestTitle: result.generatedRequest.title,
      },
    });
  }

  const amount = result.generatedExpenseEntry?.amount ?? result.generatedRequest?.amount;
  if (amount) await deductDemoBalance(from, amount);

  // 11. Format and send
  const replyText = formatAiResult(result).text || "Something went wrong. Please try again.";
  await sendTextMessage(from, replyText);
  await addToHistory(from, "assistant", replyText);
}
