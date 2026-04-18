import type { AiCommandResult } from "@/lib/types";

export type FormattedReply = { text: string };

function webLink(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app"}/w/global-hub/chat`;
}

function stripMarkdown(text: string): string {
  // Remove bold (**text**)
  let result = text.replace(/\*\*(.+?)\*\*/g, "$1");

  // Remove italic (*text*)
  result = result.replace(/\*(.+?)\*/g, "$1");

  // Remove headers (## text) - only those at start of line
  result = result.replace(/^#+\s+/gm, "");

  // Convert list items (- item) to bullets (• item)
  result = result.replace(/^-\s+/gm, "• ");

  // Remove link syntax [text](url)
  result = result.replace(/\[(.+?)\]\(.+?\)/g, "$1");

  return result;
}

export function formatAiResult(result: AiCommandResult): FormattedReply {
  // 1. pendingConfirmation
  if (result.pendingConfirmation) {
    const { previewTitle } = result.pendingConfirmation;
    return {
      text: `I'll create "${previewTitle}". Reply CONFIRM to proceed, or CANCEL to stop.`,
    };
  }

  // 2. generatedDocument
  if (result.generatedDocument) {
    const { title, awaitingSignatureFrom } = result.generatedDocument;
    let message = `Done. "${title}" is ready.`;

    if (awaitingSignatureFrom) {
      message += ` Waiting for ${awaitingSignatureFrom} to sign.`;
    }

    message += `\n\nView and sign here: ${webLink()}`;
    return { text: message };
  }

  // 3. generatedRequest
  if (result.generatedRequest) {
    const { title, amount } = result.generatedRequest;
    let message = `Request logged: ${title}`;

    if (amount !== undefined) {
      message += ` — ₦${amount.toLocaleString()}`;
    }

    message += `. The approver has been notified.\n\nView here: ${webLink()}`;
    return { text: message };
  }

  // 4. generatedExpenseEntry
  if (result.generatedExpenseEntry) {
    const { amount, title } = result.generatedExpenseEntry;
    let message = `Expense recorded: ₦${amount.toLocaleString()} for ${title}`;
    return { text: message };
  }

  // 5. generatedIssueReport
  if (result.generatedIssueReport) {
    const { title } = result.generatedIssueReport;
    const message = `Issue logged: "${title}". The relevant team has been notified.\n\nView here: ${webLink()}`;
    return { text: message };
  }

  // 6. generatedInventoryItem
  if (result.generatedInventoryItem) {
    const { name, inStock } = result.generatedInventoryItem;
    return {
      text: `${name}: ${inStock} units in stock.`,
    };
  }

  // 7. generatedPaymentLink
  if (result.generatedPaymentLink) {
    return {
      text: `Payment link ready. View here: ${webLink()}`,
    };
  }

  // 8. generatedPerson
  if (result.generatedPerson) {
    const { name, title, phone } = result.generatedPerson;
    const lines = [name];

    if (title) {
      lines.push(title);
    }

    if (phone) {
      lines.push(phone);
    }

    return { text: lines.join("\n") };
  }

  // 9. generatedPoll
  if (result.generatedPoll) {
    const { title } = result.generatedPoll;
    return {
      text: `Poll created: "${title}". View here: ${webLink()}`,
    };
  }

  // 10. generatedAppointment
  if (result.generatedAppointment) {
    const { title, when } = result.generatedAppointment;
    let message = `Appointment scheduled: ${title}`;

    if (when) {
      message += ` — ${when}`;
    }

    return { text: message };
  }

  // 11. generatedGivingRecord
  if (result.generatedGivingRecord) {
    const { amount, donor } = result.generatedGivingRecord;
    return {
      text: `Giving recorded: ₦${amount.toLocaleString()} from ${donor}.`,
    };
  }

  // 12. reply (non-empty string)
  if (result.reply.trim()) {
    return { text: stripMarkdown(result.reply) };
  }

  // 13. fallback
  return {
    text: `Something went wrong. Please try again or visit ${webLink()}`,
  };
}
