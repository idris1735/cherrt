"use client";

import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAssistant, type AssistantMessage } from "./use-assistant";
import { useAssistantCtx } from "./assistant-context";
import { useAppState } from "@/components/providers/app-state-provider";
import styles from "./assistant.module.css";

const SUGGESTIONS = [
  "How's my business?",
  "Draft a letter to a vendor",
  "Log ₦15,000 transport expense",
  "What's pending?",
];

function ActionCard({ card }: { card: NonNullable<AssistantMessage["actionCard"]> }) {
  return (
    <Link href={card.href} className={styles["asst-card"]}>
      <div>
        <div className={styles["asst-card-title"]}>{card.title}</div>
        <div className={styles["asst-card-note"]}>{card.note}</div>
      </div>
      <span className={styles["asst-card-cta"]}>{card.cta} →</span>
    </Link>
  );
}

export function AssistantWidget({ prefill }: { prefill?: string }) {
  const { snapshot } = useAppState();
  const { messages, sending, sendMessage } = useAssistant();
  const { closeAssistant } = useAssistantCtx();
  const [input, setInput] = useState(prefill ?? "");
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Apply prefill when it changes
  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Focus composer on open
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // ESC to close
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeAssistant();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeAssistant]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    sendMessage(trimmed);
    setInput("");
  }, [input, sending, sendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles["asst-panel"]} role="dialog" aria-label="Ask Chertt assistant">
      {/* Header */}
      <div className={styles["asst-header"]}>
        <Image alt="Chertt" height={24} src="/logo.png" width={24} />
        <span className={styles["asst-header-title"]}>Ask Chertt</span>
        <span className={styles["asst-header-pill"]}>AI</span>
        <button
          className={styles["asst-header-close"]}
          onClick={closeAssistant}
          aria-label="Close assistant"
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "16px", height: "16px" }}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Thread */}
      <div className={styles["asst-thread"]} ref={threadRef}>
        {messages.length === 0 ? (
          <div className={styles["asst-empty"]}>
            <p className={styles["asst-empty-greeting"]}>
              Hi{snapshot.membership.userName ? `, ${snapshot.membership.userName.split(" ")[0]}` : ""}! What can I help with?
            </p>
            <div className={styles["asst-chips"]}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className={styles["asst-chip"]} onClick={() => sendMessage(s)} type="button">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i}>
              <div className={`${styles["asst-msg"]} ${m.role === "user" ? styles["asst-msg--user"] : styles["asst-msg--assistant"]}`}>
                {m.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                ) : (
                  m.text
                )}
              </div>
              {m.actionCard && <ActionCard card={m.actionCard} />}
            </div>
          ))
        )}
        {sending && (
          <div className={styles["asst-typing"]}>
            <div className={styles["asst-typing-dot"]} />
            <div className={styles["asst-typing-dot"]} />
            <div className={styles["asst-typing-dot"]} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className={styles["asst-composer"]}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Chertt anything..."
          rows={1}
          disabled={sending}
        />
        <button
          className={styles["asst-send"]}
          onClick={handleSend}
          disabled={!input.trim() || sending}
          aria-label="Send message"
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="m22 2-7 20-4-9-9-4 20-7Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
