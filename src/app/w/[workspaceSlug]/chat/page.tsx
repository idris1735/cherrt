"use client";

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

  function buildActionReceipt(payload: AiCommandResult) {
    if (payload.generatedDocument) {
      return `Saved document: "${payload.generatedDocument.title}" (${payload.generatedDocument.type}).`;
    }
    if (payload.generatedRequest) {
      return `Created request: "${payload.generatedRequest.title}" (${payload.generatedRequest.type}).`;
    }
    if (payload.generatedInventoryItem) {
      return `Added inventory item: "${payload.generatedInventoryItem.name}" at ${payload.generatedInventoryItem.location}.`;
    }
    if (payload.generatedIssueReport) {
      return `Logged issue: "${payload.generatedIssueReport.title}" (${payload.generatedIssueReport.severity}).`;
    }
    if (payload.generatedExpenseEntry) {
      return `Logged expense: "${payload.generatedExpenseEntry.title}" (${payload.generatedExpenseEntry.department}).`;
    }
    if (payload.generatedPoll) {
      return `Created poll: "${payload.generatedPoll.title}" for ${payload.generatedPoll.audience}.`;
    }
    if (payload.generatedPerson) {
      return `Added directory profile: "${payload.generatedPerson.name}" (${payload.generatedPerson.title}).`;
    }
    if (payload.generatedAppointment) {
      return `Created appointment: "${payload.generatedAppointment.title}" (${payload.generatedAppointment.when}).`;
    }
    if (payload.generatedForm) {
      return `Created form: "${payload.generatedForm.name}".`;
    }
    if (payload.generatedPaymentLink) {
      return `Generated payment link: "${payload.generatedPaymentLink.label}".`;
    }
    return "";
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
      addMessage(conversationId, {
        id: `assistant-${Date.now()}`,
        speaker: "assistant",
        text: payload.reply,
        timeLabel: "Now",
      });

      const receipt = buildActionReceipt(payload);
      if (receipt) {
        addMessage(conversationId, {
          id: `assistant-receipt-${Date.now()}`,
          speaker: "assistant",
          text: receipt,
          timeLabel: "Now",
        });
      }

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
                  <p>{message.text}</p>
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
