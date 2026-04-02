"use client";

import { FormEvent, useMemo, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { CommandPreview } from "@/components/shared/command-preview";
import { SectionHeading } from "@/components/shared/section-heading";
import { SurfaceCard } from "@/components/shared/surface-card";
import type { AiCommandResult } from "@/lib/types";

const suggestedPrompts = [
  "Draft a vendor engagement letter for our foyer retrofit.",
  "Raise an expense request for diesel top-up tonight.",
  "Generate a payment link for conference merch invoice.",
  "Stage invitations and RSVP follow-up for the founders dinner.",
];

export default function ChatPage() {
  const { primaryConversation, addMessage, applyAiResult } = useAppState();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiCommandResult | null>(null);

  async function sendPrompt(nextPrompt: string) {
    const conversationId = primaryConversation.id;
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

    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: cleanPrompt }),
    });

    const payload = (await response.json()) as AiCommandResult;
    addMessage(conversationId, {
      id: `assistant-${Date.now()}`,
      speaker: "assistant",
      text: payload.reply,
      timeLabel: "Now",
    });
    applyAiResult(payload);
    setResult(payload);
    setLoading(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendPrompt(prompt);
  }

  const transcript = useMemo(() => primaryConversation.messages, [primaryConversation.messages]);

  return (
    <div className="page-stack">
      <div className="two-column-grid">
        <SurfaceCard className="chat-panel">
          <SectionHeading
            eyebrow="AI mode"
            title="Command workspace"
            body="Write naturally. Chertt returns a structured action, not just a clever answer."
          />
          <div className="chat-thread">
            {transcript.map((message) => (
              <article className={`chat-bubble chat-bubble--${message.speaker}`} key={message.id}>
                <span>{message.speaker === "assistant" ? "Chertt AI" : "You"}</span>
                <p>{message.text}</p>
              </article>
            ))}
            {loading ? (
              <article className="chat-bubble chat-bubble--assistant">
                <span>Chertt AI</span>
                <p>Thinking through the workflow and shaping the proper record...</p>
              </article>
            ) : null}
          </div>
          <form className="chat-composer" onSubmit={handleSubmit}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask Chertt to draft, route, summarize, capture, or generate."
              rows={4}
            />
            <div className="chat-composer__footer">
              <span>Voice notes, transcription, and AI actioning are architecture-ready in this build.</span>
              <button className="button button--primary" type="submit" disabled={loading}>
                Send command
              </button>
            </div>
          </form>
        </SurfaceCard>

        <div className="page-stack">
          <SurfaceCard>
            <SectionHeading eyebrow="Quick starts" title="Suggested prompts" />
            <div className="chip-cloud">
              {suggestedPrompts.map((item) => (
                <button className="chip-button" key={item} onClick={() => void sendPrompt(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard tone="accent">
            <SectionHeading eyebrow="Action preview" title="Structured output" />
            {result?.artifact ? (
              <CommandPreview artifact={result.artifact} />
            ) : (
              <p className="soft-copy">The latest command artifact will appear here once Chertt turns your prompt into a real operational object.</p>
            )}
            {result?.generatedDocument ? (
              <div className="artifact-sheet">
                <p className="artifact-sheet__label">{result.generatedDocument.type}</p>
                <h3>{result.generatedDocument.title}</h3>
                <pre>{result.generatedDocument.body}</pre>
              </div>
            ) : null}
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
