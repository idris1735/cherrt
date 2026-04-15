"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useTheme } from "@/components/shell/workspace-shell";
import { formatCurrency, formatMessageTime } from "@/lib/format";
import { clearActiveUserProfile, deductFromWallet, getActiveUserProfile, getWallet } from "@/lib/services/profile";
import { clearLastWorkspaceSlug } from "@/lib/services/onboarding-draft";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { AiCommandResult } from "@/lib/types";
import styles from "@/app/w/[workspaceSlug]/chat/page.module.css";

const ALL_SUGGESTION_CARDS = [
  { label: "Draft letter",      hint: "Create and route for signature",     prompt: "Draft a formal letter to our fuel vendor requesting an extension on payment terms." },
  { label: "Raise request",     hint: "Expenses, supplies, repairs",        prompt: "Raise an expense request for diesel top-up — ₦45,000 for the generator tonight." },
  { label: "Report issue",      hint: "Facility or security incident",      prompt: "Log a high-severity facility issue: generator room has a water leak." },
  { label: "Pay church tithe",  hint: "Send offering to your church",       prompt: "I want to pay my tithe of ₦20,000 to Harbour Church." },
  { label: "Schedule meeting",  hint: "Book an appointment",                prompt: "Schedule a vendor review meeting for next Monday at 10am." },
  { label: "Create event form", hint: "Registration for an event",          prompt: "Create a registration form for our annual staff dinner event." },
  { label: "Log expense",       hint: "Record petty cash or receipt",       prompt: "Log a petty cash expense of ₦8,500 for office stationery from the admin store." },
  { label: "Add staff",         hint: "Staff contact and directory",        prompt: "Add a new staff member: Sandra Eke, Admin Officer in Operations, phone 08012345678." },
  { label: "Church giving",     hint: "Record an offering or donation",     prompt: "Record a donation of ₦50,000 to Grace Assembly for their building fund." },
  { label: "Store order",       hint: "Capture a product order",           prompt: "Capture a store order for 5 branded notebooks and 3 pens for the front desk." },
  { label: "Staff feedback",    hint: "Pulse check or survey",             prompt: "Create a weekly pulse poll to check staff morale and flag any concerns." },
  { label: "Prepare invoice",   hint: "Bill a client or vendor",           prompt: "Prepare an invoice for Greenfield Partners for consulting services — ₦180,000." },
];

const suggestionCards = ALL_SUGGESTION_CARDS.slice(0, 4);

const ACTION_CARD_PREFIX = "[[chertt-card:";
const LEGACY_ACTION_CARD_PREFIX = "[[cherrt-card:";
const ACTION_CARD_SUFFIX = "]]";

type ActionCard = {
  kind: string;
  recordId?: string;
  title: string;
  note: string;
  href: string;
  cta: string;
};

function encodeActionCard(card: ActionCard) {
  return `${ACTION_CARD_PREFIX}${encodeURIComponent(JSON.stringify(card))}${ACTION_CARD_SUFFIX}`;
}

function appendActionCardToMessage(text: string, card?: ActionCard) {
  if (!card) return text;
  return `${text}\n${encodeActionCard(card)}`.trim();
}

function extractActionCardFromMessage(text: string): { body: string; card?: ActionCard } {
  const markerStart = Math.max(text.lastIndexOf(ACTION_CARD_PREFIX), text.lastIndexOf(LEGACY_ACTION_CARD_PREFIX));
  if (markerStart < 0) return { body: text };

  const markerEnd = text.indexOf(ACTION_CARD_SUFFIX, markerStart);
  if (markerEnd < 0) return { body: text };

  const matchedPrefix = text.startsWith(ACTION_CARD_PREFIX, markerStart) ? ACTION_CARD_PREFIX : LEGACY_ACTION_CARD_PREFIX;
  const encoded = text.slice(markerStart + matchedPrefix.length, markerEnd);

  try {
    const card = JSON.parse(decodeURIComponent(encoded)) as Partial<ActionCard>;
    if (!card || typeof card !== "object") return { body: text };

    const kind = typeof card.kind === "string" ? card.kind : "record";
    const recordId = typeof card.recordId === "string" ? card.recordId.trim() : undefined;
    const title = typeof card.title === "string" ? card.title.trim() : "";
    const note = typeof card.note === "string" ? card.note.trim() : "";
    const href = typeof card.href === "string" ? card.href.trim() : "";
    const cta = typeof card.cta === "string" ? card.cta.trim() : "Open";

    if (!title || !href || !href.startsWith("/")) return { body: text };

    const body = `${text.slice(0, markerStart)}${text.slice(markerEnd + ACTION_CARD_SUFFIX.length)}`.trim();
    return { body, card: { kind, recordId, title, note, href, cta } };
  } catch {
    return { body: text };
  }
}

type DraftCanvasState = {
  id: string;
  title: string;
  type: "letter" | "invoice" | "memo";
  body: string;
  preparedBy: string;
  status: "draft" | "pending" | "approved" | "in-progress" | "completed" | "flagged";
  awaitingSignatureFrom?: string;
  amount?: number;
  createdAtLabel: string;
  dirty: boolean;
  lastSavedLabel: string;
};

export default function ChatPage() {
  const { snapshot, addMessage, applyAiResult, createConversation, renameConversation, deleteConversation, upsertDocument } = useAppState();
  const { notify } = useToast();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(snapshot.conversations[0]?.id ?? "");
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draftCanvas, setDraftCanvas] = useState<DraftCanvasState | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasPreview, setCanvasPreview] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    summary: string;
    actionKey: string;
    previewTitle: string;
    originalPrompt: string;
    conversationId: string;
  } | null>(null);
  // Modal sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetContent, setSheetContent] = useState<{
    kind: string;
    recordId?: string;
    title: string;
    note: string;
    href: string;
    cta: string;
  } | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const conversations = snapshot.conversations;
  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? conversations[0];

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeConversation?.messages, loading]);

  useEffect(() => {
    if (!conversations.some((c) => c.id === activeConversationId)) {
      setActiveConversationId(conversations[0]?.id ?? "");
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 900) setSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (conversations.length === 0) {
      const id = createConversation("ai");
      setActiveConversationId(id);
    }
  }, [conversations.length, createConversation]);

  // Load and sync wallet balance
  useEffect(() => {
    setWalletBalance(getWallet().balance);
    const onWalletUpdate = () => setWalletBalance(getWallet().balance);
    window.addEventListener("chertt-wallet-updated", onWalletUpdate);
    return () => window.removeEventListener("chertt-wallet-updated", onWalletUpdate);
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch {
      // Keep demo logout resilient even if auth transport is briefly unavailable.
    } finally {
      clearActiveUserProfile();
      clearLastWorkspaceSlug();
      notify({
        tone: "success",
        title: "Signed out",
        description: "Your session has been closed.",
      });
      router.replace("/auth/sign-in");
      router.refresh();
    }
  }

  function beginConversationRename(conversationId: string, currentTitle: string) {
    setEditingConversationId(conversationId);
    setEditingConversationTitle(currentTitle);
  }

  function commitConversationRename(conversationId: string) {
    const trimmed = editingConversationTitle.trim();
    if (trimmed) {
      renameConversation(conversationId, trimmed);
    }
    setEditingConversationId(null);
    setEditingConversationTitle("");
  }

  function cancelConversationRename() {
    setEditingConversationId(null);
    setEditingConversationTitle("");
  }

  function handleDeleteConversation(conversationId: string) {
    const remainingConversations = conversations.filter((conversation) => conversation.id !== conversationId);

    if (activeConversationId === conversationId) {
      if (remainingConversations.length > 0) {
        setActiveConversationId(remainingConversations[0].id);
      } else {
        const nextId = createConversation("ai");
        setActiveConversationId(nextId);
      }
    }

    deleteConversation(conversationId);
    cancelConversationRename();
    notify({
      tone: "success",
      title: "Conversation deleted",
      description: "That chat has been removed from your history.",
    });
  }

  function buildActionCard(payload: AiCommandResult): ActionCard | undefined {
    const base = `/w/${snapshot.workspace.slug}`;

    if (payload.generatedDocument) {
      return {
        kind: "document",
        recordId: payload.generatedDocument.id,
        title: payload.generatedDocument.title,
        note: `${payload.generatedDocument.type} draft ready for review and routing.`,
        href: `${base}/modules/toolkit/documents/${payload.generatedDocument.id}`,
        cta: "Open document",
      };
    }
    if (payload.generatedRequest) {
      if (payload.generatedRequest.module === "toolkit") {
        return {
          kind: "request",
          recordId: payload.generatedRequest.id,
          title: payload.generatedRequest.title,
          note: `${payload.generatedRequest.type} request now in approval queue.`,
          href: `${base}/modules/toolkit/requests/${payload.generatedRequest.id}`,
          cta: "Open request",
        };
      }
      return {
        kind: "request",
        recordId: payload.generatedRequest.id,
        title: payload.generatedRequest.title,
        note: `Created under ${payload.generatedRequest.module} workflows.`,
        href: `${base}/modules/${payload.generatedRequest.module}`,
        cta: "Open module",
      };
    }
    if (payload.generatedInventoryItem) {
      return {
        kind: "inventory",
        recordId: payload.generatedInventoryItem.id,
        title: payload.generatedInventoryItem.name,
        note: `Stock tracked at ${payload.generatedInventoryItem.location}.`,
        href: `${base}/modules/toolkit/inventory/${payload.generatedInventoryItem.id}`,
        cta: "Open item",
      };
    }
    if (payload.generatedIssueReport) {
      return {
        kind: "issue",
        recordId: payload.generatedIssueReport.id,
        title: payload.generatedIssueReport.title,
        note: `${payload.generatedIssueReport.severity} severity issue logged.`,
        href: `${base}/modules/toolkit/issues/${payload.generatedIssueReport.id}`,
        cta: "Open issue",
      };
    }
    if (payload.generatedExpenseEntry) {
      return {
        kind: "expense",
        recordId: payload.generatedExpenseEntry.id,
        title: payload.generatedExpenseEntry.title,
        note: `${payload.generatedExpenseEntry.department} expense captured.`,
        href: `${base}/modules/toolkit/expenses/${payload.generatedExpenseEntry.id}`,
        cta: "Open expense",
      };
    }
    if (payload.generatedPoll) {
      return {
        kind: "poll",
        recordId: payload.generatedPoll.id,
        title: payload.generatedPoll.title,
        note: `Audience: ${payload.generatedPoll.audience}.`,
        href: `${base}/modules/toolkit/feedback/${payload.generatedPoll.id}`,
        cta: "Open poll",
      };
    }
    if (payload.generatedPerson) {
      return {
        kind: "directory",
        recordId: payload.generatedPerson.id,
        title: payload.generatedPerson.name,
        note: `${payload.generatedPerson.title} profile added.`,
        href: `${base}/modules/toolkit/directory/${payload.generatedPerson.id}`,
        cta: "Open profile",
      };
    }
    if (payload.generatedAppointment) {
      return {
        kind: "appointment",
        recordId: payload.generatedAppointment.id,
        title: payload.generatedAppointment.title,
        note: payload.generatedAppointment.when,
        href: `${base}/modules/toolkit/appointments/${payload.generatedAppointment.id}`,
        cta: "Open appointment",
      };
    }
    if (payload.generatedForm) {
      return {
        kind: "form",
        recordId: payload.generatedForm.id,
        title: payload.generatedForm.name,
        note: "Form scaffold created and ready to publish.",
        href: `${base}/modules/toolkit/forms/${payload.generatedForm.id}`,
        cta: "Open form",
      };
    }
    if (payload.generatedPaymentLink) {
      return {
        kind: "payment-link",
        recordId: payload.generatedPaymentLink.id,
        title: payload.generatedPaymentLink.label,
        note: "Payment link generated and ready to share.",
        href: `${base}/modules/toolkit/records`,
        cta: "Open records",
      };
    }
    if (payload.generatedGivingRecord) {
      const g = payload.generatedGivingRecord;
      const acct = g.virtualAccount ? `Account: ${g.virtualAccount}` : "";
      const amtLabel = formatCurrency(g.amount, snapshot.workspace.currency);
      return {
        kind: "giving",
        recordId: g.id,
        title: `${g.givingType ? g.givingType.charAt(0).toUpperCase() + g.givingType.slice(1) : "Giving"} — ${g.churchName || "Church"}`,
        note: `${amtLabel}${acct ? ` · ${acct}` : ""}`,
        href: `${base}/settings`,
        cta: "View transactions",
      };
    }
    return undefined;
  }

  useEffect(() => {
    if (!draftCanvas || !draftCanvas.dirty) return;
    const timeout = window.setTimeout(() => {
      upsertDocument({
        id: draftCanvas.id,
        title: draftCanvas.title,
        type: draftCanvas.type,
        body: draftCanvas.body,
        status: draftCanvas.status,
        preparedBy: draftCanvas.preparedBy,
        awaitingSignatureFrom: draftCanvas.awaitingSignatureFrom,
        amount: draftCanvas.amount,
        createdAtLabel: draftCanvas.createdAtLabel,
      });
      setDraftCanvas((curr) =>
        curr && curr.id === draftCanvas.id ? { ...curr, dirty: false, lastSavedLabel: "Saved now" } : curr,
      );
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [draftCanvas, upsertDocument]);

  function buildMemoryContext(): string {
    const { documents, requests, expenses, issues, appointments, paymentLinks, giving, careRequests } = snapshot;
    const cur = snapshot.workspace.currency;
    const lines: string[] = [];
    if (documents.length) {
      lines.push(`Documents (${documents.length}): ${documents.slice(0, 8).map((d) => `"${d.title}" [${d.type}, ${d.status}]`).join(", ")}`);
    }
    if (requests.length) {
      lines.push(`Requests (${requests.length}): ${requests.slice(0, 8).map((r) => `"${r.title}" [${r.type}, ${r.status}${r.amount ? `, ${formatCurrency(r.amount, cur)}` : ""}]`).join(", ")}`);
    }
    if (expenses.length) {
      lines.push(`Expenses (${expenses.length}): ${expenses.slice(0, 8).map((e) => `"${e.title}" [${e.department}, ${formatCurrency(e.amount, cur)}, ${e.status}]`).join(", ")}`);
    }
    if (issues.length) {
      lines.push(`Issues (${issues.length}): ${issues.slice(0, 6).map((i) => `"${i.title}" [${i.area}, ${i.severity}, ${i.status}]`).join(", ")}`);
    }
    if (appointments.length) {
      lines.push(`Appointments (${appointments.length}): ${appointments.slice(0, 6).map((a) => `"${a.title}" [${a.when}, ${a.owner}]`).join(", ")}`);
    }
    if (paymentLinks.length) {
      lines.push(`Payment links (${paymentLinks.length}): ${paymentLinks.slice(0, 6).map((p) => `"${p.label}" [${formatCurrency(p.amount, cur)}, ${p.status}]`).join(", ")}`);
    }
    if (giving.length) {
      lines.push(`Giving records (${giving.length}): ${giving.slice(0, 6).map((g) => `${g.donor} — ${formatCurrency(g.amount, cur)} via ${g.channel}`).join(", ")}`);
    }
    if (careRequests.length) {
      lines.push(`Care requests (${careRequests.length}): ${careRequests.slice(0, 6).map((c) => `${c.requester} — ${c.type} [${c.status}]`).join(", ")}`);
    }
    const profile = typeof window !== "undefined" ? getActiveUserProfile() : null;
    if (profile) {
      const profileParts = [`Name: ${profile.fullName}`];
      if (profile.jobTitle) profileParts.push(`Title: ${profile.jobTitle}`);
      if (profile.organization) profileParts.push(`Organization: ${profile.organization}`);
      if (profile.phone) profileParts.push(`Phone: ${profile.phone}`);
      if (profile.city) profileParts.push(`City: ${profile.city}`);
      if (profile.email) profileParts.push(`Email: ${profile.email}`);
      if (profile.signatureName) profileParts.push(`Signing name: ${profile.signatureName}`);
      if (profile.bio) profileParts.push(`Personal context: ${profile.bio}`);
      lines.push(`User profile: ${profileParts.join(", ")}`);
    } else {
      lines.push(`User: ${snapshot.membership.userName} (${snapshot.membership.role})`);
    }
    lines.push(`Workspace: ${snapshot.workspace.name}, ${snapshot.workspace.city}`);
    lines.push(`Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
    return lines.join("\n");
  }

  async function sendPrompt(nextPrompt: string, opts: { confirmed?: boolean; conversationIdOverride?: string } = {}) {
    const conversationId =
      opts.conversationIdOverride ??
      activeConversation?.id ??
      (() => {
        const id = createConversation("ai");
        setActiveConversationId(id);
        return id;
      })();
    const cleanPrompt = nextPrompt.trim();
    if (!cleanPrompt) return;

    const now = Date.now();

    // Capture the title NOW before addMessage auto-renames it from the user's text.
    // This lets us later check whether the conversation was still "new" at send time.
    const titleAtSend = snapshot.conversations.find((c) => c.id === conversationId)?.title ?? "";
    const wasDefaultTitle = /^new chat$/i.test(titleAtSend.trim());

    // Only add a visible user message on the first (unconfirmed) send
    if (!opts.confirmed) {
      addMessage(conversationId, { id: `user-${now}`, speaker: "user", text: cleanPrompt, timeLabel: "Now", createdAt: now });
      setPrompt("");
    }

    setLoading(true);

    const targetConversation =
      snapshot.conversations.find((conversation) => conversation.id === conversationId) ??
      activeConversation;

    // Build history from the target conversation (last 12 messages, excluding action card markers)
    const rawHistory = (targetConversation?.messages ?? []).slice(-12).map((m) => ({
      speaker: m.speaker,
      text: extractActionCardFromMessage(m.text).body,
    }));

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          confirmed: opts.confirmed ?? false,
          context: {
            role: snapshot.membership.role,
            enabledModules: snapshot.workspace.modules,
            userName: snapshot.membership.userName,
            userTitle: (typeof window !== "undefined" ? getActiveUserProfile()?.jobTitle : undefined) ?? snapshot.membership.title,
            userOrganization: (typeof window !== "undefined" ? getActiveUserProfile()?.organization : undefined) ?? snapshot.workspace.name,
          },
          history: rawHistory,
          memoryContext: buildMemoryContext(),
        }),
      });

      if (!response.ok) throw new Error("Command failed");

      const payload = (await response.json()) as AiCommandResult;

      // Confirmation gate — AI wants user to confirm before creating a formal artifact
      if (payload.pendingConfirmation) {
        setPendingConfirmation({
          ...payload.pendingConfirmation,
          originalPrompt: cleanPrompt,
          conversationId,
        });
        return;
      }

      const actionCard = buildActionCard(payload);
      const assistantText = appendActionCardToMessage(payload.reply, actionCard);
      const assistantNow = Date.now();

      addMessage(conversationId, { id: `assistant-${assistantNow}`, speaker: "assistant", text: assistantText, timeLabel: "Now", createdAt: assistantNow });
      applyAiResult(payload);

      // Deduct from demo wallet for giving records and payment links
      if (payload.generatedGivingRecord?.amount) {
        const label = `${payload.generatedGivingRecord.givingType || "Giving"} to ${payload.generatedGivingRecord.churchName || "church"}`;
        deductFromWallet(payload.generatedGivingRecord.amount, label);
      } else if (payload.generatedPaymentLink?.amount) {
        deductFromWallet(payload.generatedPaymentLink.amount, payload.generatedPaymentLink.label);
      }

      // Rename the conversation from the artifact title if it was still the
      // default name when the user hit send (captured before addMessage ran).
      if (wasDefaultTitle && actionCard?.title) {
        renameConversation(conversationId, actionCard.title);
      }

      if (payload.generatedDocument) {
        setDraftCanvas({
          id: payload.generatedDocument.id,
          title: payload.generatedDocument.title,
          type: payload.generatedDocument.type,
          body: payload.generatedDocument.body,
          preparedBy: payload.generatedDocument.preparedBy,
          status: payload.generatedDocument.status,
          awaitingSignatureFrom: payload.generatedDocument.awaitingSignatureFrom,
          amount: payload.generatedDocument.amount,
          createdAtLabel: payload.generatedDocument.createdAtLabel,
          dirty: false,
          lastSavedLabel: "Just now",
        });
        setCanvasOpen(true);
      }
    } catch {
      const errNow = Date.now();
      addMessage(conversationId, {
        id: `assistant-error-${errNow}`,
        speaker: "assistant",
        text: "I could not process that request right now. Please try again.",
        timeLabel: "Now",
        createdAt: errNow,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!pendingConfirmation) return;
    const { originalPrompt, conversationId } = pendingConfirmation;
    setPendingConfirmation(null);
    await sendPrompt(originalPrompt, { confirmed: true, conversationIdOverride: conversationId });
  }

  function handleCancelConfirmation() {
    if (!pendingConfirmation) return;
    const { conversationId } = pendingConfirmation;
    setPendingConfirmation(null);
    const cancelNow = Date.now();
    addMessage(conversationId, {
      id: `assistant-cancel-${cancelNow}`,
      speaker: "assistant",
      text: "Cancelled. Let me know if you'd like to try something different.",
      timeLabel: "Now",
      createdAt: cancelNow,
    });
  }

  function openSheet(card: NonNullable<typeof sheetContent>) {
    setSheetContent(card);
    setSheetOpen(true);
  }

  function openDraftFromCard(recordId?: string) {
    if (!recordId) return;
    const doc = snapshot.documents.find((d) => d.id === recordId);
    if (!doc) return;
    setDraftCanvas({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      body: doc.body,
      preparedBy: doc.preparedBy,
      status: doc.status,
      awaitingSignatureFrom: doc.awaitingSignatureFrom,
      amount: doc.amount,
      createdAtLabel: doc.createdAtLabel,
      dirty: false,
      lastSavedLabel: "Loaded",
    });
    setCanvasOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(prompt);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading && prompt.trim()) void sendPrompt(prompt);
    }
  }

  function handleSuggestionClick(suggestionPrompt: string) {
    setPrompt(suggestionPrompt);
    composerRef.current?.focus();
  }

  function handleAttachClick() {
    notify({
      title: "File uploads aren't live yet",
      description: "Use text-only requests for now while attachments are being wired up.",
      tone: "info",
    });
  }

  const transcript = useMemo(() => activeConversation?.messages ?? [], [activeConversation?.messages]);
  const hasMessages = transcript.length > 0;
  const isSeedIntroOnly =
    transcript.length === 1 &&
    transcript[0]?.speaker === "assistant" &&
    transcript[0]?.text.startsWith("This is Chertt AI.");
  const isLanding = !hasMessages || isSeedIntroOnly;
  const speakerClass: Record<"assistant" | "user" | "system" | "teammate", string> = {
    assistant: styles.messageAssistant,
    user: styles.messageUser,
    system: styles.messageSystem,
    teammate: styles.messageTeammate,
  };

  return (
    <div className={`${styles.chat} ${sidebarOpen ? styles.chatSidebarOpen : styles.chatSidebarClosed}`}>
      {/* Sidebar open overlay on mobile */}
      {sidebarOpen ? (
        <button aria-label="Close sidebar" className={styles.overlay} onClick={() => setSidebarOpen(false)} type="button" />
      ) : null}

      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Brand row */}
        <div className={styles.sidebarBrand}>
          <div className={styles.brandMark}>
            <Image alt="Chertt" className={styles.brandLogo} height={22} priority src="/logo.png" width={22} />
            <span className={styles.brandName}>Chertt</span>
          </div>
          <button
            aria-label="Close sidebar"
            className={styles.sidebarToggleBtn}
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 6H6m0 8h8M6 10h8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* New chat */}
        <div className={styles.sidebarHead}>
          <button
            className={styles.newChatButton}
            onClick={() => {
              const nextId = createConversation("ai");
              setActiveConversationId(nextId);
              setPrompt("");
            }}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 2v12M2 8h12" strokeLinecap="round" />
            </svg>
            New chat
          </button>
        </div>

        {/* History */}
        <div className={styles.history} aria-label="Past chats">
          {conversations.length > 0 ? (
            <p className={styles.historyLabel}>Recent</p>
          ) : null}
          {conversations.map((conv) => (
            <div
              className={`${styles.historyRow} ${conv.id === activeConversation?.id ? styles.historyRowActive : ""}`}
              key={conv.id}
            >
              {editingConversationId === conv.id ? (
                <input
                  autoFocus
                  className={styles.historyEditInput}
                  onBlur={() => commitConversationRename(conv.id)}
                  onChange={(event) => setEditingConversationTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitConversationRename(conv.id);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelConversationRename();
                    }
                  }}
                  value={editingConversationTitle}
                />
              ) : (
                <button
                  className={`${styles.historyItem} ${conv.id === activeConversation?.id ? styles.historyItemActive : ""}`}
                  onClick={() => setActiveConversationId(conv.id)}
                  type="button"
                >
                  {conv.title}
                </button>
              )}

              <div className={styles.historyActions}>
                <button
                  aria-label={`Rename ${conv.title}`}
                  className={styles.historyActionButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    beginConversationRename(conv.id, conv.title);
                  }}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 11.5V13h1.5L11.8 5.7l-1.5-1.5L3 11.5Z" strokeLinejoin="round" />
                    <path d="M9.8 3.2l1.5 1.5" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  aria-label={`Delete ${conv.title}`}
                  className={styles.historyActionButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteConversation(conv.id);
                  }}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3.5 4.5h9" strokeLinecap="round" />
                    <path d="M6 4.5V3.7c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7v.8" strokeLinecap="round" />
                    <path d="M5 6.5v5.2c0 .4.3.8.8.8h4.4c.4 0 .8-.3.8-.8V6.5" strokeLinecap="round" />
                    <path d="M6.7 7.3v4.1M9.3 7.3v4.1" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Records panel */}
        <div className={styles.recordsSection}>
          <button
            className={styles.recordsToggle}
            onClick={() => setRecordsOpen((o) => !o)}
            type="button"
          >
            <span>Records</span>
            <svg aria-hidden="true" className={recordsOpen ? styles.recordsChevronOpen : ""} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {recordsOpen ? (
            <div className={styles.recordsList}>
              {snapshot.documents.length > 0 && (
                <div className={styles.recordsGroup}>
                  <p className={styles.recordsGroupLabel}>Documents</p>
                  {snapshot.documents.slice(0, 6).map((d) => (
                    <Link
                      className={styles.recordsItem}
                      href={`/w/${snapshot.workspace.slug}/modules/toolkit/documents/${d.id}`}
                      key={d.id}
                      onClick={() => setRecordsOpen(false)}
                    >
                      <span>{d.title}</span>
                      <span className={styles.recordsItemStatus}>{d.status}</span>
                    </Link>
                  ))}
                </div>
              )}
              {snapshot.requests.filter((r) => r.module === "toolkit").length > 0 && (
                <div className={styles.recordsGroup}>
                  <p className={styles.recordsGroupLabel}>Requests</p>
                  {snapshot.requests.filter((r) => r.module === "toolkit").slice(0, 6).map((r) => (
                    <Link
                      className={styles.recordsItem}
                      href={`/w/${snapshot.workspace.slug}/modules/toolkit/requests/${r.id}`}
                      key={r.id}
                      onClick={() => setRecordsOpen(false)}
                    >
                      <span>{r.title}</span>
                      <span className={styles.recordsItemStatus}>{r.status}</span>
                    </Link>
                  ))}
                </div>
              )}
              {snapshot.expenses.length > 0 && (
                <div className={styles.recordsGroup}>
                  <p className={styles.recordsGroupLabel}>Expenses</p>
                  {snapshot.expenses.slice(0, 6).map((e) => (
                    <Link
                      className={styles.recordsItem}
                      href={`/w/${snapshot.workspace.slug}/modules/toolkit/expenses/${e.id}`}
                      key={e.id}
                      onClick={() => setRecordsOpen(false)}
                    >
                      <span>{e.title}</span>
                      <span className={styles.recordsItemStatus}>{formatCurrency(e.amount, snapshot.workspace.currency)}</span>
                    </Link>
                  ))}
                </div>
              )}
              {snapshot.issues.length > 0 && (
                <div className={styles.recordsGroup}>
                  <p className={styles.recordsGroupLabel}>Issues</p>
                  {snapshot.issues.slice(0, 6).map((i) => (
                    <Link
                      className={styles.recordsItem}
                      href={`/w/${snapshot.workspace.slug}/modules/toolkit/issues/${i.id}`}
                      key={i.id}
                      onClick={() => setRecordsOpen(false)}
                    >
                      <span>{i.title}</span>
                      <span className={styles.recordsItemStatus}>{i.severity}</span>
                    </Link>
                  ))}
                </div>
              )}
              {snapshot.appointments.length > 0 && (
                <div className={styles.recordsGroup}>
                  <p className={styles.recordsGroupLabel}>Appointments</p>
                  {snapshot.appointments.slice(0, 6).map((a) => (
                    <Link
                      className={styles.recordsItem}
                      href={`/w/${snapshot.workspace.slug}/modules/toolkit/appointments/${a.id}`}
                      key={a.id}
                      onClick={() => setRecordsOpen(false)}
                    >
                      <span>{a.title}</span>
                      <span className={styles.recordsItemStatus}>{a.when}</span>
                    </Link>
                  ))}
                </div>
              )}
              {snapshot.documents.length === 0 && snapshot.requests.length === 0 && snapshot.expenses.length === 0 && snapshot.issues.length === 0 && snapshot.appointments.length === 0 && (
                <p className={styles.recordsEmpty}>Nothing created yet. Ask Chertt to get started.</p>
              )}
            </div>
          ) : null}
        </div>

        {/* Balance chip */}
        {walletBalance !== null ? (
          <div className={styles.walletChip}>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="1" y="4" width="14" height="9" rx="1.5" />
              <path d="M11 8.5a.5.5 0 100-1 .5.5 0 000 1z" fill="currentColor" stroke="none" />
              <path d="M1 7h14" strokeLinecap="round" />
            </svg>
            <span>{formatCurrency(walletBalance, snapshot.workspace.currency)}</span>
          </div>
        ) : null}

        {/* Footer: user + theme toggle */}
        <div className={styles.sidebarFoot}>
          <div className={styles.footAvatar} title={`${snapshot.membership.userName} (${snapshot.membership.title})`}>
            {snapshot.membership.avatarInitials}
          </div>
          <div className={styles.footMeta}>
            <span className={styles.footName}>{snapshot.membership.userName}</span>
            <button className={styles.logoutBtn} onClick={handleLogout} type="button">
              {loggingOut ? "Signing out..." : "Log out"}
            </button>
          </div>
          <Link
            aria-label="Profile settings"
            className={`${styles.themeBtn} ${styles.profileBtn}`}
            href={`/w/${snapshot.workspace.slug}/settings`}
            title="Profile & settings"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="8" cy="5.5" r="2.5" />
              <path d="M2.5 13.5c0-3 2-4.5 5.5-4.5s5.5 1.5 5.5 4.5" strokeLinecap="round" />
            </svg>
          </Link>
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className={styles.themeBtn}
            onClick={toggleTheme}
            type="button"
          >
            {theme === "dark" ? (
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 11a3 3 0 100-6 3 3 0 000 6zm0-8V1m0 14v-2m7-5h-2M3 8H1m11.07-4.07-1.41 1.41M5.34 10.66l-1.41 1.41m9.14 0-1.41-1.41M5.34 5.34 3.93 3.93" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 2a6 6 0 000 12 6 6 0 006-6 4.5 4.5 0 01-6-6z" />
              </svg>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <section className={`${styles.main} ${isLanding ? styles.mainLanding : styles.mainChat}`}>
        {/* Sidebar open toggle (shown when sidebar is closed) */}
        <button
          aria-label="Open sidebar"
          className={styles.edgeToggle}
          onClick={() => setSidebarOpen(true)}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h12M4 10h12M4 14h12" strokeLinecap="round" />
          </svg>
        </button>

        {isLanding ? (
          <div className={styles.landingShell}>
            <div className={styles.emptyWrap}>
              <h1>What can I help with?</h1>
            </div>

            <div className={styles.suggestionGrid}>
              {suggestionCards.map((item) => (
                <button className={styles.suggestionCard} key={item.label} onClick={() => handleSuggestionClick(item.prompt)} type="button">
                  <strong>{item.label}</strong>
                  <p>{item.hint}</p>
                </button>
              ))}
            </div>

            <form className={`${styles.composer} ${styles.composerLanding}`} onSubmit={handleSubmit}>
              <button
                aria-label="Attach file"
                className={styles.attachButton}
                onClick={handleAttachClick}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M13 7l-5 5a3 3 0 01-4.24-4.24l5-5a2 2 0 012.83 2.83L6.5 10.5a1 1 0 01-1.41-1.41L10 4" strokeLinecap="round" />
                </svg>
              </button>
              <textarea
                ref={composerRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Message Chertt..."
                rows={1}
              />
              <button className={styles.sendButton} type="submit" disabled={loading || !prompt.trim()}>
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M14 8L2 2l3 6-3 6 12-6z" />
                </svg>
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.chatWorkarea}>
            <div className={styles.chatColumn}>
              <div className={styles.thread} ref={threadRef}>
                {transcript.map((msg, index) => (
                  <article
                    className={`${styles.message} ${speakerClass[msg.speaker]}`}
                    key={msg.id}
                    style={{ animationDelay: `${Math.min(index * 35, 220)}ms` }}
                  >
                    {(() => {
                      const parsed = extractActionCardFromMessage(msg.text);
                      const card = parsed.card;
                      return (
                        <>
                          {parsed.body ? (
                            <div className={`${styles.messageText} ${msg.speaker === "user" ? styles.messageTextUser : ""}`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {parsed.body}
                              </ReactMarkdown>
                              {msg.createdAt ? (
                                <span className={styles.messageTime}>{formatMessageTime(msg.createdAt)}</span>
                              ) : null}
                            </div>
                          ) : null}
                          {card ? (
                            card.kind === "document" && card.recordId ? (
                              <button
                                className={styles.inlineActionCard}
                                onClick={() => {
                                  openDraftFromCard(card.recordId);
                                  openSheet(card);
                                }}
                                type="button"
                              >
                                <span className={styles.inlineActionKind}>{card.kind}</span>
                                <strong className={styles.inlineActionTitle}>{card.title}</strong>
                                {card.note ? <p className={styles.inlineActionNote}>{card.note}</p> : null}
                                <span className={styles.inlineActionCta}>Open in canvas →</span>
                              </button>
                            ) : (
                              <button
                                className={styles.inlineActionCard}
                                onClick={() => openSheet(card)}
                                type="button"
                              >
                                <span className={styles.inlineActionKind}>{card.kind}</span>
                                <strong className={styles.inlineActionTitle}>{card.title}</strong>
                                {card.note ? <p className={styles.inlineActionNote}>{card.note}</p> : null}
                                <span className={styles.inlineActionCta}>{card.cta} →</span>
                              </button>
                            )
                          ) : null}
                        </>
                      );
                    })()}
                  </article>
                ))}

                {/* Confirmation card — appears inline in thread above the composer */}
                {pendingConfirmation ? (
                  <article className={`${styles.message} ${styles.messageAssistant} ${styles.confirmCard}`}>
                    <p className={styles.confirmLabel}>Ready to create</p>
                    <strong className={styles.confirmTitle}>{pendingConfirmation.previewTitle}</strong>
                    <p className={styles.confirmSummary}>{pendingConfirmation.summary}</p>
                    <div className={styles.confirmActions}>
                      <button className={styles.confirmCancel} onClick={handleCancelConfirmation} type="button">
                        Cancel
                      </button>
                      <button className={styles.confirmGo} onClick={() => void handleConfirm()} type="button">
                        Confirm →
                      </button>
                    </div>
                  </article>
                ) : null}

                {loading ? (
                  <article className={`${styles.message} ${styles.messageAssistant} ${styles.messageThinking}`}>
                    <span className={styles.thinkingDots}>
                      <span /><span /><span />
                    </span>
                  </article>
                ) : null}
              </div>

              <form className={styles.composer} onSubmit={handleSubmit}>
                <button
                  aria-label="Attach file"
                  className={styles.attachButton}
                  onClick={handleAttachClick}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M13 7l-5 5a3 3 0 01-4.24-4.24l5-5a2 2 0 012.83 2.83L6.5 10.5a1 1 0 01-1.41-1.41L10 4" strokeLinecap="round" />
                  </svg>
                </button>
                <textarea
                  ref={composerRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Message Chertt..."
                  rows={1}
                />
                <button className={styles.sendButton} type="submit" disabled={loading || !prompt.trim()}>
                  <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M14 8L2 2l3 6-3 6 12-6z" />
                  </svg>
                </button>
              </form>
            </div>

            <div className={`${styles.canvasPaneWrap} ${canvasOpen && draftCanvas ? styles.canvasPaneWrapOpen : ""}`}>
            {draftCanvas ? (
              <aside className={styles.canvasPane}>
                <div className={styles.canvasHead}>
                  <div>
                    <p className={styles.canvasEyebrow}>Writing Canvas</p>
                    <strong className={styles.canvasTitle}>{draftCanvas.title}</strong>
                    <span className={styles.canvasMeta}>{draftCanvas.type} · {draftCanvas.lastSavedLabel}</span>
                  </div>
                  <div className={styles.canvasActions}>
                    <div className={styles.canvasViewToggle}>
                      <button
                        className={`${styles.canvasViewBtn} ${canvasPreview ? styles.canvasViewBtnActive : ""}`}
                        onClick={() => setCanvasPreview(true)}
                        type="button"
                      >
                        Preview
                      </button>
                      <button
                        className={`${styles.canvasViewBtn} ${!canvasPreview ? styles.canvasViewBtnActive : ""}`}
                        onClick={() => setCanvasPreview(false)}
                        type="button"
                      >
                        Edit
                      </button>
                    </div>
                    {!canvasPreview ? (
                      <button
                        className={styles.canvasButton}
                        onClick={() => {
                          upsertDocument({
                            id: draftCanvas.id,
                            title: draftCanvas.title,
                            type: draftCanvas.type,
                            body: draftCanvas.body,
                            status: draftCanvas.status,
                            preparedBy: draftCanvas.preparedBy,
                            awaitingSignatureFrom: draftCanvas.awaitingSignatureFrom,
                            amount: draftCanvas.amount,
                            createdAtLabel: draftCanvas.createdAtLabel,
                          });
                          setDraftCanvas((c) => (c ? { ...c, dirty: false, lastSavedLabel: "Saved now" } : c));
                        }}
                        type="button"
                      >
                        Save
                      </button>
                    ) : null}
                    <button className={styles.canvasButton} onClick={() => setCanvasOpen(false)} type="button">
                      Close
                    </button>
                  </div>
                </div>

                {canvasPreview ? (
                  <div className={styles.canvasPreviewWrap}>
                    <div className={styles.canvasPreviewDoc}>
                      <span className={styles.canvasDocTypeBadge}>{draftCanvas.type}</span>
                      <div className={styles.canvasDocBody}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {draftCanvas.body}
                        </ReactMarkdown>
                      </div>
                    </div>

                    {/* Sign-off section */}
                    {draftCanvas.awaitingSignatureFrom && draftCanvas.status === "pending" ? (
                      <div className={styles.canvasSignRow}>
                        <p className={styles.canvasSignInfo}>
                          Awaiting signature from <strong>{draftCanvas.awaitingSignatureFrom}</strong>
                        </p>
                        <button
                          className={styles.canvasSignBtn}
                          onClick={() => {
                            const next = {
                              id: draftCanvas.id,
                              title: draftCanvas.title,
                              type: draftCanvas.type,
                              body: draftCanvas.body,
                              status: "approved" as const,
                              preparedBy: draftCanvas.preparedBy,
                              awaitingSignatureFrom: undefined,
                              amount: draftCanvas.amount,
                              createdAtLabel: draftCanvas.createdAtLabel,
                            };
                            upsertDocument(next);
                            setDraftCanvas((c) => c ? { ...c, status: "approved", awaitingSignatureFrom: undefined, dirty: false, lastSavedLabel: "Signed" } : c);
                          }}
                          type="button"
                        >
                          Sign off ✓
                        </button>
                      </div>
                    ) : draftCanvas.status === "approved" ? (
                      <div className={styles.canvasSignRow}>
                        <p className={styles.canvasSignApproved}>✓ Signed and approved</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <textarea
                    className={styles.canvasTextarea}
                    onChange={(e) =>
                      setDraftCanvas((c) => c ? { ...c, body: e.target.value, dirty: true, lastSavedLabel: "Saving..." } : c)
                    }
                    spellCheck={false}
                    value={draftCanvas.body}
                  />
                )}
              </aside>
            ) : null}
            </div>
          </div>
        )}
      </section>

      {/* Detail sheet — slides in from right, stays in chat */}
      {sheetOpen && sheetContent ? (
        <>
          <button
            aria-label="Close panel"
            className={styles.sheetBackdrop}
            onClick={() => setSheetOpen(false)}
            type="button"
          />
          <aside className={styles.sheet}>
            <div className={styles.sheetHead}>
              <span className={styles.sheetKind}>{sheetContent.kind}</span>
              <button
                aria-label="Close"
                className={styles.sheetClose}
                onClick={() => setSheetOpen(false)}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <h2 className={styles.sheetTitle}>{sheetContent.title}</h2>
            {sheetContent.note ? <p className={styles.sheetNote}>{sheetContent.note}</p> : null}

            {/* Rich record detail */}
            {(() => {
              const { kind, recordId } = sheetContent;
              if (!recordId) return null;

              if (kind === "request") {
                const rec = snapshot.requests.find((r) => r.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Type</span><strong>{rec.type}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Requester</span><strong>{rec.requester}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Status</span><strong>{rec.status}</strong></div>
                    {rec.amount ? (
                      <div className={styles.sheetDetailRow}><span>Amount</span><strong>{formatCurrency(rec.amount, snapshot.workspace.currency)}</strong></div>
                    ) : null}
                    {rec.approvalSteps.length > 0 ? (
                      <div className={styles.sheetSteps}>
                        {rec.approvalSteps.map((step) => (
                          <div className={styles.sheetStep} key={step.id}>
                            <span className={`${styles.sheetStepDot} ${step.completed ? styles.sheetStepDotDone : ""}`} />
                            <div>
                              <strong>{step.label}</strong>
                              <p>{step.assignee} · {step.dueLabel}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (kind === "issue") {
                const rec = snapshot.issues.find((i) => i.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Area</span><strong>{rec.area}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Severity</span><strong>{rec.severity}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Status</span><strong>{rec.status}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Reported by</span><strong>{rec.reportedBy}</strong></div>
                  </div>
                );
              }

              if (kind === "expense") {
                const rec = snapshot.expenses.find((e) => e.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Department</span><strong>{rec.department}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Amount</span><strong>{formatCurrency(rec.amount, snapshot.workspace.currency)}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Status</span><strong>{rec.status}</strong></div>
                    {rec.receiptCount > 0 ? (
                      <div className={styles.sheetDetailRow}><span>Receipts</span><strong>{rec.receiptCount}</strong></div>
                    ) : null}
                  </div>
                );
              }

              if (kind === "document") {
                const rec = snapshot.documents.find((d) => d.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Type</span><strong>{rec.type}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Status</span><strong>{rec.status}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Prepared by</span><strong>{rec.preparedBy}</strong></div>
                    {rec.awaitingSignatureFrom ? (
                      <div className={styles.sheetDetailRow}><span>Awaiting</span><strong>{rec.awaitingSignatureFrom}</strong></div>
                    ) : null}
                  </div>
                );
              }

              if (kind === "inventory") {
                const rec = snapshot.inventory.find((i) => i.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Location</span><strong>{rec.location}</strong></div>
                    <div className={styles.sheetDetailRow}><span>In stock</span><strong>{rec.inStock}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Min level</span><strong>{rec.minLevel}</strong></div>
                    {rec.reserved > 0 ? (
                      <div className={styles.sheetDetailRow}><span>Reserved</span><strong>{rec.reserved}</strong></div>
                    ) : null}
                  </div>
                );
              }

              if (kind === "directory") {
                const rec = snapshot.directory.find((p) => p.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Title</span><strong>{rec.title}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Unit</span><strong>{rec.unit}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Phone</span><strong>{rec.phone}</strong></div>
                  </div>
                );
              }

              if (kind === "appointment") {
                const rec = snapshot.appointments.find((a) => a.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>When</span><strong>{rec.when}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Owner</span><strong>{rec.owner}</strong></div>
                  </div>
                );
              }

              if (kind === "form") {
                const rec = snapshot.forms.find((f) => f.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Owner</span><strong>{rec.owner}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Submissions</span><strong>{rec.submissions}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Status</span><strong>Active</strong></div>
                  </div>
                );
              }

              if (kind === "payment-link") {
                const rec = snapshot.paymentLinks.find((link) => link.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Amount</span><strong>{formatCurrency(rec.amount, snapshot.workspace.currency)}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Status</span><strong>{rec.status}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Label</span><strong>{rec.label}</strong></div>
                  </div>
                );
              }

              if (kind === "giving") {
                const rec = snapshot.giving.find((entry) => entry.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Church</span><strong>{rec.churchName || "Church"}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Amount</span><strong>{formatCurrency(rec.amount, snapshot.workspace.currency)}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Type</span><strong>{rec.givingType || "Giving"}</strong></div>
                    {rec.virtualAccount ? (
                      <div className={styles.sheetDetailRow}><span>Account</span><strong>{rec.virtualAccount}</strong></div>
                    ) : null}
                  </div>
                );
              }

              if (kind === "poll") {
                const rec = snapshot.polls.find((p) => p.id === recordId);
                if (!rec) return null;
                return (
                  <div className={styles.sheetDetail}>
                    <div className={styles.sheetDetailRow}><span>Audience</span><strong>{rec.audience}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Status</span><strong>{rec.status}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Questions</span><strong>{rec.questionCount}</strong></div>
                    <div className={styles.sheetDetailRow}><span>Responses</span><strong>{rec.responseCount} / {rec.targetCount}</strong></div>
                  </div>
                );
              }

              return null;
            })()}

            <div className={styles.sheetActions}>
              <Link
                className={styles.sheetPrimaryBtn}
                href={sheetContent.href}
                onClick={() => setSheetOpen(false)}
              >
                {sheetContent.cta}
              </Link>
              <button
                className={styles.sheetSecondaryBtn}
                onClick={() => setSheetOpen(false)}
                type="button"
              >
                Back to chat
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
