import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
  deductDemoBalance,
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

function buildDemoContext(session: ReturnType<typeof getSession>): string {
  return [
    `User is a WhatsApp guest (not onboarded). Treat them as an owner-level demo user.`,
    `Demo balance remaining: ₦${session.demoBalance.toLocaleString()}.`,
    `When they log an expense or raise a request with an amount, acknowledge the deduction from their demo balance in your reply.`,
    `Encourage them to sign up for a real workspace at: ${APP_URL}/auth/sign-in`,
  ].join(" ");
}

function buildContext(
  session: ReturnType<typeof getSession>,
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
    history,
    memoryContext: memoryParts.join("\n\n"),
  };
}

export async function processWhatsAppMessage(message: IncomingMessage): Promise<void> {
  const { from, type } = message;
  const session = getSession(from);
  const trimmed = (message.text ?? "").trim();

  // First contact — send welcome message and mark as welcomed
  if (!session.welcomed) {
    updateSession(from, { welcomed: true });
    await sendTextMessage(from, buildWelcomeMessage(session.demoBalance));
    return;
  }

  // 1. CANCEL keyword
  if (/^cancel$/i.test(trimmed)) {
    clearPending(from);
    await sendTextMessage(from, "Cancelled.");
    return;
  }

  // 2. CONFIRM/YES keyword — re-run pending command with confirmed=true
  if (/^(confirm|yes)$/i.test(trimmed) && session.pendingConfirmation) {
    const { originalPrompt } = session.pendingConfirmation;
    clearPending(from);
    const freshSession = getSession(from);
    const result = await runCherttCommand(originalPrompt, buildContext(freshSession), true);
    if (result.pendingConfirmation) {
      updateSession(from, {
        pendingConfirmation: {
          originalPrompt,
          artifactKind: result.pendingConfirmation.actionKey ?? "",
          previewTitle: result.pendingConfirmation.previewTitle ?? "",
        },
      });
    }
    // Track pending approval if a request was created on confirmation
    if (result.generatedRequest) {
      updateSession(from, {
        pendingApproval: {
          requestId: result.generatedRequest.id,
          requestTitle: result.generatedRequest.title,
        },
      });
    }
    // Deduct from demo balance if expense or request has an amount
    const amount = result.generatedExpenseEntry?.amount ?? result.generatedRequest?.amount;
    if (amount) deductDemoBalance(from, amount);

    const replyText = formatAiResult(result).text || "Something went wrong. Please try again.";
    await sendTextMessage(from, replyText);
    addToHistory(from, "assistant", replyText);
    return;
  }

  // 3. APPROVE keyword
  if (/^approve$/i.test(trimmed) && session.pendingApproval) {
    clearPending(from);
    await sendTextMessage(from, "Approved. The requester will be notified.");
    return;
  }

  // 4. REJECT keyword
  if (/^reject\b/i.test(trimmed) && session.pendingApproval) {
    const reason = trimmed.replace(/^reject\s*/i, "").trim();
    const { requestTitle } = session.pendingApproval;
    clearPending(from);
    const rejectMsg = reason
      ? `Rejected: "${requestTitle}". Reason: ${reason}`
      : `Rejected: "${requestTitle}".`;
    await sendTextMessage(from, rejectMsg);
    return;
  }

  // 5. Audio messages — not supported
  if (type === "audio") {
    await sendTextMessage(from, "Voice messages aren't supported yet. Please type your request.");
    return;
  }

  // 6. No text and no media
  if (!trimmed && !message.mediaId) {
    await sendTextMessage(from, "I didn't understand that. Please type your request.");
    return;
  }

  // 7. Handle image/document media
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
  addToHistory(from, "user", prompt);

  // 9. Call AI
  const freshSession = getSession(from);
  const result = await runCherttCommand(prompt, buildContext(freshSession, mediaDataUrl), false);

  // 10. Store pending states
  if (result.pendingConfirmation) {
    updateSession(from, {
      pendingConfirmation: {
        originalPrompt: prompt,
        artifactKind: result.pendingConfirmation.actionKey ?? "",
        previewTitle: result.pendingConfirmation.previewTitle ?? "",
      },
    });
  }

  if (result.generatedRequest) {
    updateSession(from, {
      pendingApproval: {
        requestId: result.generatedRequest.id,
        requestTitle: result.generatedRequest.title,
      },
    });
  }

  // Deduct from demo balance on expense/request creation
  const amount = result.generatedExpenseEntry?.amount ?? result.generatedRequest?.amount;
  if (amount) deductDemoBalance(from, amount);

  // 11. Format and send reply
  const replyText = formatAiResult(result).text || "Something went wrong. Please try again.";
  await sendTextMessage(from, replyText);
  addToHistory(from, "assistant", replyText);
}
