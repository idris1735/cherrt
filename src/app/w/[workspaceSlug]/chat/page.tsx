"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import type { AiCommandResult } from "@/lib/types";
import styles from "@/app/w/[workspaceSlug]/chat/page.module.css";

const suggestionCards = [
  {
    label: "Draft letter",
    hint: "Create and route for signature",
    prompt: "Draft a letter to our fuel vendor and route it for signature.",
  },
  {
    label: "Raise request",
    hint: "Expenses, supplies, repairs",
    prompt: "Raise an expense request for diesel top-up tonight.",
  },
  {
    label: "Report issue",
    hint: "Facility or security incident",
    prompt: "Log a facility issue with urgent priority and assign Facilities.",
  },
  {
    label: "Create checklist",
    hint: "Onboarding or process steps",
    prompt: "Create onboarding steps for a new admin staff member.",
  },
];

const ACTION_CARD_PREFIX = "[[cherrt-card:";
const ACTION_CARD_SUFFIX = "]]";

type ActionCard = {
  kind: string;
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
  const markerStart = text.lastIndexOf(ACTION_CARD_PREFIX);
  if (markerStart < 0) {
    return { body: text };
  }

  const markerEnd = text.indexOf(ACTION_CARD_SUFFIX, markerStart);
  if (markerEnd < 0) {
    return { body: text };
  }

  const encoded = text.slice(markerStart + ACTION_CARD_PREFIX.length, markerEnd);

  try {
    const card = JSON.parse(decodeURIComponent(encoded)) as Partial<ActionCard>;
    if (!card || typeof card !== "object") {
      return { body: text };
    }

    const kind = typeof card.kind === "string" ? card.kind : "record";
    const title = typeof card.title === "string" ? card.title.trim() : "";
    const note = typeof card.note === "string" ? card.note.trim() : "";
    const href = typeof card.href === "string" ? card.href.trim() : "";
    const cta = typeof card.cta === "string" ? card.cta.trim() : "Open";

    if (!title || !href || !href.startsWith("/")) {
      return { body: text };
    }

    const body = `${text.slice(0, markerStart)}${text.slice(markerEnd + ACTION_CARD_SUFFIX.length)}`.trim();

    return {
      body,
      card: { kind, title, note, href, cta },
    };
  } catch {
    return { body: text };
  }
}

export default function ChatPage() {
  const { snapshot, addMessage, applyAiResult, createConversation } = useAppState();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(snapshot.conversations[0]?.id ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [greetingChars, setGreetingChars] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);

  const conversations = snapshot.conversations;
  const firstName = snapshot.membership.userName.split(" ").filter(Boolean)[0] || "there";
  const greetingFrames = useMemo(
    () => [
      `Welcome back, ${firstName}.`,
      "Draft a letter. Make a report. Raise a request.",
      "Ask Chertt in plain language.",
    ],
    [firstName],
  );
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];

  useEffect(() => {
    const element = threadRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [activeConversation?.messages, loading]);

  useEffect(() => {
    if (!conversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId(conversations[0]?.id ?? "");
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 900) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    setGreetingIndex(0);
    setGreetingChars(0);
  }, [greetingFrames]);

  useEffect(() => {
    const currentLine = greetingFrames[greetingIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (greetingChars < currentLine.length) {
      timeout = setTimeout(() => setGreetingChars((current) => current + 1), 32);
    } else {
      timeout = setTimeout(() => {
        setGreetingIndex((current) => (current + 1) % greetingFrames.length);
        setGreetingChars(0);
      }, 1700);
    }

    return () => clearTimeout(timeout);
  }, [greetingChars, greetingFrames, greetingIndex]);

  function buildActionCard(payload: AiCommandResult): ActionCard | undefined {
    const base = `/w/${snapshot.workspace.slug}`;

    if (payload.generatedDocument) {
      return {
        kind: "document",
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
          title: payload.generatedRequest.title,
          note: `${payload.generatedRequest.type} request now in approval queue.`,
          href: `${base}/modules/toolkit/requests/${payload.generatedRequest.id}`,
          cta: "Open request",
        };
      }

      return {
        kind: "request",
        title: payload.generatedRequest.title,
        note: `Created under ${payload.generatedRequest.module} workflows.`,
        href: `${base}/modules/${payload.generatedRequest.module}`,
        cta: "Open module",
      };
    }

    if (payload.generatedInventoryItem) {
      return {
        kind: "inventory",
        title: payload.generatedInventoryItem.name,
        note: `Stock tracked at ${payload.generatedInventoryItem.location}.`,
        href: `${base}/modules/toolkit/inventory/${payload.generatedInventoryItem.id}`,
        cta: "Open item",
      };
    }

    if (payload.generatedIssueReport) {
      return {
        kind: "issue",
        title: payload.generatedIssueReport.title,
        note: `${payload.generatedIssueReport.severity} severity issue logged.`,
        href: `${base}/modules/toolkit/issues/${payload.generatedIssueReport.id}`,
        cta: "Open issue",
      };
    }

    if (payload.generatedExpenseEntry) {
      return {
        kind: "expense",
        title: payload.generatedExpenseEntry.title,
        note: `${payload.generatedExpenseEntry.department} expense captured.`,
        href: `${base}/modules/toolkit/expenses/${payload.generatedExpenseEntry.id}`,
        cta: "Open expense",
      };
    }

    if (payload.generatedPoll) {
      return {
        kind: "poll",
        title: payload.generatedPoll.title,
        note: `Audience: ${payload.generatedPoll.audience}.`,
        href: `${base}/modules/toolkit/feedback/${payload.generatedPoll.id}`,
        cta: "Open poll",
      };
    }

    if (payload.generatedPerson) {
      return {
        kind: "directory",
        title: payload.generatedPerson.name,
        note: `${payload.generatedPerson.title} profile added.`,
        href: `${base}/modules/toolkit/directory/${payload.generatedPerson.id}`,
        cta: "Open profile",
      };
    }

    if (payload.generatedAppointment) {
      return {
        kind: "appointment",
        title: payload.generatedAppointment.title,
        note: payload.generatedAppointment.when,
        href: `${base}/modules/toolkit/appointments`,
        cta: "Open calendar",
      };
    }

    if (payload.generatedForm) {
      return {
        kind: "form",
        title: payload.generatedForm.name,
        note: "Form scaffold created and ready to publish.",
        href: `${base}/modules/toolkit/forms`,
        cta: "Open forms",
      };
    }

    if (payload.generatedPaymentLink) {
      return {
        kind: "payment-link",
        title: payload.generatedPaymentLink.label,
        note: "Payment link generated and ready to share.",
        href: `${base}/modules/toolkit/records`,
        cta: "Open records",
      };
    }

    return undefined;
  }

  async function sendPrompt(nextPrompt: string) {
    if (!activeConversation) {
      return;
    }

    const conversationId = activeConversation.id;
    const cleanPrompt = nextPrompt.trim();
    if (!cleanPrompt) return;

    addMessage(conversationId, {
      id: `user-${Date.now()}`,
      speaker: "user",
      text: cleanPrompt,
      timeLabel: "Now",
    });
    setPrompt("");
    setLoading(true);

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          context: {
            role: snapshot.membership.role,
            enabledModules: snapshot.workspace.modules,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Command failed");
      }

      const payload = (await response.json()) as AiCommandResult;
      const actionCard = buildActionCard(payload);
      const assistantText = appendActionCardToMessage(payload.reply, actionCard);

      addMessage(conversationId, {
        id: `assistant-${Date.now()}`,
        speaker: "assistant",
        text: assistantText,
        timeLabel: "Now",
      });

      applyAiResult(payload);
    } catch {
      addMessage(conversationId, {
        id: `assistant-error-${Date.now()}`,
        speaker: "assistant",
        text: "I could not process that request right now. Please try again.",
        timeLabel: "Now",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(prompt);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading && prompt.trim()) {
        void sendPrompt(prompt);
      }
    }
  }

  const transcript = useMemo(
    () => activeConversation?.messages ?? [],
    [activeConversation?.messages],
  );
  const hasMessages = transcript.length > 0;
  const isSeedIntroOnly =
    transcript.length === 1 &&
    transcript[0]?.speaker === "assistant" &&
    transcript[0]?.text.startsWith("This is Chertt AI.");
  const isLanding = !hasMessages || isSeedIntroOnly;
  const animatedGreeting = greetingFrames[greetingIndex].slice(0, greetingChars);
  const speakerClass: Record<"assistant" | "user" | "system" | "teammate", string> = {
    assistant: styles.messageAssistant,
    user: styles.messageUser,
    system: styles.messageSystem,
    teammate: styles.messageTeammate,
  };

  return (
    <div className={`${styles.chat} ${sidebarOpen ? styles.chatSidebarOpen : styles.chatSidebarClosed}`}>
      <button
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        className={styles.edgeToggle}
        onClick={() => setSidebarOpen((current) => !current)}
        type="button"
      >
        <svg aria-hidden="true" className={styles.toggleIcon} viewBox="0 0 20 20">
          <rect x="2.5" y="3" width="15" height="14" rx="2.5" />
          <path d="M8 3V17" />
        </svg>
      </button>

      {sidebarOpen ? (
        <button
          aria-label="Close sidebar"
          className={styles.overlay}
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <aside className={styles.sidebar}>
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
            + New chat
          </button>
        </div>

        <div className={styles.history} aria-label="Past chats">
          {conversations.map((conversation) => (
            <button
              className={`${styles.historyItem} ${conversation.id === activeConversation?.id ? styles.historyItemActive : ""}`}
              key={conversation.id}
              onClick={() => setActiveConversationId(conversation.id)}
              type="button"
            >
              {conversation.title}
            </button>
          ))}
        </div>
      </aside>

      <section className={`${styles.main} ${isLanding ? styles.mainLanding : styles.mainChat}`}>
        {isLanding ? (
          <div className={styles.landingShell}>
            <div className={styles.emptyWrap}>
              <h1>
                {animatedGreeting}
                <span className={styles.caret}>|</span>
              </h1>
            </div>

            <div className={styles.suggestionGrid}>
              {suggestionCards.map((item) => (
                <button className={styles.suggestionCard} key={item.label} onClick={() => void sendPrompt(item.prompt)} type="button">
                  <strong>{item.label}</strong>
                  <p>{item.hint}</p>
                </button>
              ))}
            </div>

            <form className={`${styles.composer} ${styles.composerLanding}`} onSubmit={handleSubmit}>
              <button aria-label="Attach item" className={styles.attachButton} type="button">
                +
              </button>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Message Chertt..."
                rows={1}
              />
              <button className={styles.sendButton} type="submit" disabled={loading || !prompt.trim()}>
                Send
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className={styles.thread} ref={threadRef}>
              {transcript.map((message, index) => (
                <article
                  className={`${styles.message} ${speakerClass[message.speaker]}`}
                  key={message.id}
                  style={{ animationDelay: `${Math.min(index * 35, 220)}ms` }}
                >
                  {(() => {
                    const parsed = extractActionCardFromMessage(message.text);
                    const lines = parsed.body ? parsed.body.split("\n").filter((line) => line.trim().length > 0) : [];

                    return (
                      <>
                        {lines.length ? (
                          <div className={styles.messageText}>
                            {lines.map((line, lineIndex) => (
                              <p key={`${message.id}-line-${lineIndex}`}>{line}</p>
                            ))}
                          </div>
                        ) : null}

                        {parsed.card ? (
                          <Link className={styles.inlineActionCard} href={parsed.card.href}>
                            <span className={styles.inlineActionKind}>{parsed.card.kind}</span>
                            <strong className={styles.inlineActionTitle}>{parsed.card.title}</strong>
                            {parsed.card.note ? <p className={styles.inlineActionNote}>{parsed.card.note}</p> : null}
                            <span className={styles.inlineActionCta}>{parsed.card.cta}</span>
                          </Link>
                        ) : null}
                      </>
                    );
                  })()}
                </article>
              ))}

              {loading ? (
                <article className={`${styles.message} ${styles.messageAssistant} ${styles.messageThinking}`}>
                  <p>Thinking...</p>
                </article>
              ) : null}
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <button aria-label="Attach item" className={styles.attachButton} type="button">
                +
              </button>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Message Chertt..."
                rows={1}
              />
              <button className={styles.sendButton} type="submit" disabled={loading || !prompt.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
