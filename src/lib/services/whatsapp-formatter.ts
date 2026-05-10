import type { AiCommandResult } from "@/lib/types";
import type { WhatsAppSession } from "@/lib/services/whatsapp-session";
import type { PhoneLink } from "@/lib/services/whatsapp-workspace";

export type FormattedReply = { text: string };

function webLink(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://chertt.app"}/w/global-hub/chat`;
}

function fmt(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^-\s+/gm, "• ")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");
}

export function formatAiResult(
  result: AiCommandResult,
  session?: WhatsAppSession,
  link?: PhoneLink | null,
): FormattedReply {
  const isWorkspace = Boolean(link);

  // 1. pendingConfirmation — handled by processor before calling this
  if (result.pendingConfirmation) {
    const { previewTitle } = result.pendingConfirmation;
    return { text: `I'll create *"${previewTitle}"*.\n\nReply *CONFIRM* to proceed or *CANCEL* to stop.` };
  }

  // 2. generatedDocument
  if (result.generatedDocument) {
    const { title, body, awaitingSignatureFrom, type } = result.generatedDocument;
    const typeLabel = type === "invoice" ? "📄 *Invoice ready*" : type === "memo" ? "📝 *Memo drafted*" : "📄 *Letter drafted*";
    const preview = body ? `\n\n${body.slice(0, 500)}${body.length > 500 ? "..." : ""}` : "";
    const sig = awaitingSignatureFrom ? `\n\n_Routed to ${awaitingSignatureFrom} for signature._` : "";
    const saved = isWorkspace ? "\n\n✅ Saved to your workspace." : `\n\nView it here: ${webLink()}`;
    return { text: `${typeLabel}\n*${title}*${preview}${sig}${saved}` };
  }

  // 3. generatedRequest
  if (result.generatedRequest) {
    const { title, amount, description, type } = result.generatedRequest;
    const lines = [
      `📋 *Request submitted*`,
      ``,
      `*${title}*`,
      amount ? `• Amount: *${fmt(amount)}*` : null,
      type ? `• Type: ${type}` : null,
      description ? `• ${description}` : null,
    ].filter(Boolean);

    if (isWorkspace) {
      lines.push(``, `⏳ Your approver has been notified via WhatsApp.`);
    } else {
      lines.push(``, `⏳ Pending approval.`);
      if (amount && session) {
        lines.push(`💰 Demo balance: *${fmt(session.demoBalance)}* remaining`);
      }
    }
    return { text: lines.join("\n") };
  }

  // 4. generatedExpenseEntry
  if (result.generatedExpenseEntry) {
    const { amount, title, department } = result.generatedExpenseEntry;
    const lines = [
      `✅ *Expense recorded*`,
      ``,
      `• Item: ${title}`,
      `• Amount: *${fmt(amount)}*`,
      department && department !== "General" ? `• Department: ${department}` : null,
    ].filter(Boolean);

    if (!isWorkspace && session) {
      lines.push(``, `💰 Demo balance: *${fmt(session.demoBalance)}* remaining`);
    } else if (isWorkspace) {
      lines.push(``, `✅ Logged to your workspace records.`);
    }
    return { text: lines.join("\n") };
  }

  // 5. generatedIssueReport
  if (result.generatedIssueReport) {
    const { title, area, severity } = result.generatedIssueReport;
    const severityEmoji = severity === "high" ? "🔴" : severity === "medium" ? "🟡" : "🟢";
    const lines = [
      `🔧 *Issue reported*`,
      ``,
      `*${title}*`,
      area ? `• Area: ${area}` : null,
      `• Severity: ${severityEmoji} ${severity ?? "medium"}`,
      ``,
      isWorkspace ? `✅ Logged. The facilities team has been notified.` : `Logged. Relevant team notified.`,
    ].filter(Boolean);
    return { text: lines.join("\n") };
  }

  // 6. generatedInventoryItem
  if (result.generatedInventoryItem) {
    const { name, inStock, minLevel, location } = result.generatedInventoryItem;
    const stockStatus = inStock <= (minLevel ?? 0) ? "⚠️ Low stock" : "✅ In stock";
    const lines = [
      `📦 *Inventory*`,
      ``,
      `*${name}*`,
      `• Units: *${inStock}* ${stockStatus}`,
      minLevel ? `• Reorder level: ${minLevel}` : null,
      location ? `• Location: ${location}` : null,
    ].filter(Boolean);
    return { text: lines.join("\n") };
  }

  // 7. generatedPaymentLink
  if (result.generatedPaymentLink) {
    const { label, amount } = result.generatedPaymentLink;
    return {
      text: [`💳 *Payment link ready*`, ``, `*${label}*`, amount ? `Amount: ${fmt(amount)}` : null, ``, `View and share: ${webLink()}`].filter(Boolean).join("\n"),
    };
  }

  // 8. generatedPerson
  if (result.generatedPerson) {
    const { name, title, unit, phone } = result.generatedPerson;
    const lines = [`👤 *${name}*`];
    if (title) lines.push(title);
    if (unit) lines.push(`Unit: ${unit}`);
    if (phone) lines.push(`📞 ${phone}`);
    return { text: lines.join("\n") };
  }

  // 9. generatedPoll
  if (result.generatedPoll) {
    const { title, lane } = result.generatedPoll;
    const typeLabel = lane === "approval" ? "Approval poll" : lane === "guest" ? "Guest feedback" : "Staff pulse";
    return {
      text: [`📊 *${typeLabel} created*`, ``, `*${title}*`, ``, isWorkspace ? `✅ Shared with your workspace.` : `View here: ${webLink()}`].join("\n"),
    };
  }

  // 10. generatedForm
  if (result.generatedForm) {
    const { name } = result.generatedForm;
    return {
      text: [`📋 *Form created*`, ``, `*${name}*`, ``, isWorkspace ? `✅ Available in your workspace.` : `View here: ${webLink()}`].join("\n"),
    };
  }

  // 11. generatedAppointment
  if (result.generatedAppointment) {
    const { title, when } = result.generatedAppointment;
    return {
      text: [`📅 *Appointment scheduled*`, ``, `*${title}*`, when ? `• When: ${when}` : null, ``, isWorkspace ? `✅ Saved to your workspace calendar.` : `Added to your schedule.`].filter(Boolean).join("\n"),
    };
  }

  // 12. generatedGivingRecord
  if (result.generatedGivingRecord) {
    const { amount, donor } = result.generatedGivingRecord;
    return {
      text: `🙏 *Giving recorded*\n\n• Amount: ${fmt(amount)}\n• Donor: ${donor}\n\n✅ Record saved.`,
    };
  }

  // 13. reply text
  if (result.reply?.trim()) {
    return { text: stripMarkdown(result.reply) };
  }

  // 14. fallback
  return { text: `Something went wrong. Please try again or visit ${webLink()}` };
}
