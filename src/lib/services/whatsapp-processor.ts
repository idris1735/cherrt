import {
  getSession,
  updateSession,
  addToHistory,
  clearPending,
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

function buildContext(
  session: ReturnType<typeof getSession>,
  mediaDataUrl?: string,
): CommandExecutionContext {
  // Map session history (role: "user"|"assistant") to context history (speaker: string)
  const history = session.history.map((entry) => ({
    speaker: entry.role === "user" ? "user" : "assistant",
    text: entry.text,
  }));

  return {
    role: "owner",
    history,
    ...(mediaDataUrl ? { memoryContext: `Attached image: ${mediaDataUrl}` } : {}),
  };
}

export async function processWhatsAppMessage(message: IncomingMessage): Promise<void> {
  const { from, type } = message;
  const session = getSession(from);
  const trimmed = (message.text ?? "").trim();

  // 1. CANCEL keyword — clear pending state without calling AI
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
    if (result.generatedRequest) {
      updateSession(from, {
        pendingApproval: {
          requestId: result.generatedRequest.id,
          requestTitle: result.generatedRequest.title,
        },
      });
    }
    const formatted = formatAiResult(result);
    await sendTextMessage(from, formatted.text);
    addToHistory(from, "user", originalPrompt);
    addToHistory(from, "assistant", formatted.text);
    return;
  }

  // 3. APPROVE keyword
  if (/^approve$/i.test(trimmed) && session.pendingApproval) {
    clearPending(from);
    await sendTextMessage(from, "Approved. The requester will be notified.");
    return;
  }

  // 4. REJECT keyword
  if (/^reject/i.test(trimmed) && session.pendingApproval) {
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

  // 7. Handle image/document with media
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

  // 10. Store pending states if returned
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

  // 11. Format and send reply
  const formatted = formatAiResult(result);
  await sendTextMessage(from, formatted.text);
  addToHistory(from, "assistant", formatted.text);
}
