"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { toolkitQuickPrompts } from "@/lib/data/toolkit";
import type { AiCommandResult, Conversation, Message, Person } from "@/lib/types";

const ACTION_CARD_PREFIX = "[[cherrt-card:";
const ACTION_CARD_SUFFIX = "]]";

type ResultAction = {
  kind: string;
  title: string;
  note: string;
  href: string;
  actionLabel: string;
  systemText: string;
};

type InlineActionCard = {
  kind: string;
  title: string;
  note: string;
  href: string;
  cta: string;
};

const teamPrompts = [
  "Facilities, confirm the AC repair timeline.",
  "Finance, review the diesel request before noon.",
  "Admin, share the visitor process note here.",
  "People Ops, who owns onboarding for new hires this week?",
];

const suggestedTeamUsers: Person[] = [
  { id: "person-4", name: "Jordan Lee", title: "Finance Lead", unit: "Finance", phone: "+00 000 000 0104" },
  { id: "person-5", name: "Amina Yusuf", title: "Admin Coordinator", unit: "Administration", phone: "+00 000 000 0105" },
  { id: "person-6", name: "Diego Santos", title: "Procurement Officer", unit: "Operations", phone: "+00 000 000 0106" },
];

function buildTeamReply(text: string, personName: string) {
  const clean = text.toLowerCase();
  const firstName = personName.split(" ")[0] ?? personName;

  if (clean.includes("finance")) {
    return `${firstName} is on it.\nThe finance review is being picked up and this thread will be updated shortly.`;
  }

  if (clean.includes("facilities") || clean.includes("repair") || clean.includes("issue")) {
    return `${firstName} acknowledged this.\nAn update will be shared here after inspection.`;
  }

  if (clean.includes("process") || clean.includes("document")) {
    return `${firstName} pinned the relevant process note here.\nUse it as the working reference for the team.`;
  }

  if (clean.includes("onboarding") || clean.includes("staff")) {
    return `${firstName} confirmed ownership.\nThe onboarding checklist will be dropped into this thread.`;
  }

  return `${firstName} has this.\nThis thread will stay updated as the work moves forward.`;
}

function formatTimestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessageText(text: string) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line, index) => (
    <Fragment key={`${line}-${index}`}>
      <span className="tk-msg__line">{line}</span>
    </Fragment>
  ));
}

function renderMessageAvatar(message: Message, userInitials: string) {
  if (message.speaker === "assistant") {
    return (
      <span className="tk-msg__avatar tk-msg__avatar--assistant">
        <Image alt="Chertt" className="tk-msg__avatar-logo" height={20} priority src="/logo.png" width={20} />
      </span>
    );
  }

  if (message.speaker === "teammate") {
    return (
      <span className="tk-msg__avatar tk-msg__avatar--team">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="9" cy="9" r="3" />
          <circle cx="16.5" cy="10.5" r="2.5" />
          <path d="M4.5 19a5 5 0 0 1 9 0M13.5 18.5a4 4 0 0 1 6 0" />
        </svg>
      </span>
    );
  }

  if (message.speaker === "user") {
    return <span className="tk-msg__avatar tk-msg__avatar--user">{userInitials}</span>;
  }

  return null;
}

function encodeActionCard(card: InlineActionCard) {
  return `${ACTION_CARD_PREFIX}${encodeURIComponent(JSON.stringify(card))}${ACTION_CARD_SUFFIX}`;
}

function appendActionCardToMessage(text: string, card?: InlineActionCard) {
  if (!card) return text;
  return `${text}\n${encodeActionCard(card)}`.trim();
}

function extractActionCardFromMessage(text: string): { body: string; card?: InlineActionCard } {
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
    const card = JSON.parse(decodeURIComponent(encoded)) as Partial<InlineActionCard>;
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

function toInlineActionCard(action: ResultAction | null | undefined): InlineActionCard | undefined {
  if (!action) return undefined;
  return {
    kind: action.kind,
    title: action.title,
    note: action.note,
    href: action.href,
    cta: action.actionLabel,
  };
}

function describeResult(result: AiCommandResult | null, workspaceSlug: string): ResultAction | null {
  if (!result) return null;

  const base = `/w/${workspaceSlug}/modules/toolkit`;
  const workspaceBase = `/w/${workspaceSlug}`;

  if (result.generatedDocument) {
    return {
      kind: "document",
      title: result.generatedDocument.title,
      note: `Saved in Smart Documents as a ${result.generatedDocument.type}.`,
      href: `${base}/documents/${result.generatedDocument.id}`,
      actionLabel: "Open document",
      systemText: `Created "${result.generatedDocument.title}" in Smart Documents.\nOpen it to review, edit, or route for approval.`,
    };
  }

  if (result.generatedRequest) {
    if (result.generatedRequest.module !== "toolkit") {
      return {
        kind: "request",
        title: result.generatedRequest.title,
        note: `${result.generatedRequest.type} request created in ${result.generatedRequest.module} module.`,
        href: `${workspaceBase}/modules/${result.generatedRequest.module}`,
        actionLabel: "Open module",
        systemText: `Created "${result.generatedRequest.title}" in ${result.generatedRequest.module} workflows.\nOpen the module to continue.`,
      };
    }

    return {
      kind: "request",
      title: result.generatedRequest.title,
      note: `Added to Requests as ${result.generatedRequest.type.toLowerCase()}.`,
      href: `${base}/requests/${result.generatedRequest.id}`,
      actionLabel: "Open request",
      systemText: `Created "${result.generatedRequest.title}" in Requests.\nOpen it to review the details and approval route.`,
    };
  }

  if (result.generatedAppointment) {
    return {
      kind: "appointment",
      title: result.generatedAppointment.title,
      note: `Added to Appointments for ${result.generatedAppointment.when}.`,
      href: `${base}/appointments`,
      actionLabel: "Open appointments",
      systemText: `Scheduled "${result.generatedAppointment.title}".\nOpen Appointments to see it in the schedule.`,
    };
  }

  if (result.generatedForm) {
    return {
      kind: "form",
      title: result.generatedForm.name,
      note: `Saved in Forms under ${result.generatedForm.owner}.`,
      href: `${base}/forms`,
      actionLabel: "Open forms",
      systemText: `Created "${result.generatedForm.name}" in Forms.\nOpen Forms to review and manage it.`,
    };
  }

  if (result.generatedPaymentLink) {
    return {
      kind: "payment-link",
      title: result.generatedPaymentLink.label,
      note: "Payment link generated and ready to share.",
      href: `${base}/documents`,
      actionLabel: "Open records",
      systemText: `Created a payment link for "${result.generatedPaymentLink.label}".\nOpen Records to review the linked invoice flow.`,
    };
  }

  return null;
}

export default function ToolkitChatPage() {
  const { snapshot, addMessage, applyAiResult } = useAppState();
  const aiConversation = snapshot.conversations.find((conversation) => conversation.mode === "ai") ?? snapshot.conversations[0];
  const teamConversation = snapshot.conversations.find((conversation) => conversation.mode === "team") ?? snapshot.conversations[0];
  const [mode, setMode] = useState<"ai" | "team">("ai");
  const [prompt, setPrompt] = useState("");
  const [loadingMode, setLoadingMode] = useState<"ai" | "team" | null>(null);
  const [lastResult, setLastResult] = useState<AiCommandResult | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamDirectory, setTeamDirectory] = useState<Person[]>(snapshot.directory);
  const [activePersonId, setActivePersonId] = useState(snapshot.directory[0]?.id ?? "");
  const threadRef = useRef<HTMLDivElement>(null);

  const currentConversation: Conversation = mode === "ai" ? aiConversation : teamConversation;
  const transcript = useMemo(() => currentConversation.messages, [currentConversation.messages]);
  const visibleTranscript = useMemo(() => transcript.filter((message) => message.speaker !== "system"), [transcript]);
  const promptLibrary = mode === "ai" ? toolkitQuickPrompts : teamPrompts;
  const visiblePrompts = useMemo(() => promptLibrary.slice(0, mode === "ai" ? 4 : 3), [mode, promptLibrary]);
  const activePerson = useMemo(
    () => teamDirectory.find((person) => person.id === activePersonId) ?? teamDirectory[0] ?? null,
    [activePersonId, teamDirectory],
  );
  const filteredTeamPeople = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    if (!query) return teamDirectory;

    return teamDirectory.filter((person) =>
      [person.name, person.title, person.unit].some((value) => value.toLowerCase().includes(query)),
    );
  }, [teamDirectory, teamSearch]);
  const nextSuggestedPerson = useMemo(
    () => suggestedTeamUsers.find((person) => !teamDirectory.some((member) => member.id === person.id)) ?? null,
    [teamDirectory],
  );
  const userInitials = snapshot.membership.avatarInitials;
  const latestAction = mode === "ai" ? describeResult(lastResult, snapshot.workspace.slug) : null;

  useEffect(() => {
    if (!teamDirectory.some((person) => person.id === activePersonId)) {
      setActivePersonId(teamDirectory[0]?.id ?? "");
    }
  }, [activePersonId, teamDirectory]);

  useEffect(() => {
    const element = threadRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [visibleTranscript, loadingMode, mode]);

  async function sendAiMessage(text: string, conversationId: string) {
    addMessage(conversationId, {
      id: `u-${Date.now()}`,
      speaker: "user",
      text,
      timeLabel: formatTimestamp(),
    });

    setPrompt("");
    setLoadingMode("ai");

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!response.ok) {
        throw new Error("Command failed");
      }

      const payload = (await response.json()) as AiCommandResult;
      const action = describeResult(payload, snapshot.workspace.slug);
      const assistantText = appendActionCardToMessage(payload.reply, toInlineActionCard(action));

      addMessage(conversationId, {
        id: `ai-${Date.now()}`,
        speaker: "assistant",
        text: assistantText,
        timeLabel: formatTimestamp(),
      });

      applyAiResult(payload);
      setLastResult(payload);
    } catch {
      addMessage(conversationId, {
        id: `err-${Date.now()}`,
        speaker: "assistant",
        text: "Something went wrong connecting to Chertt AI.\nPlease try again.",
        timeLabel: formatTimestamp(),
      });
    } finally {
      setLoadingMode(null);
    }
  }

  function sendTeamMessage(text: string, conversationId: string) {
    addMessage(conversationId, {
      id: `team-user-${Date.now()}`,
      speaker: "user",
      text,
      timeLabel: formatTimestamp(),
    });

    setPrompt("");
    setLoadingMode("team");

    window.setTimeout(() => {
      addMessage(conversationId, {
        id: `team-reply-${Date.now()}`,
        speaker: "teammate",
        text: buildTeamReply(text, activePerson?.name ?? "The team"),
        timeLabel: formatTimestamp(),
      });
      setLoadingMode(null);
    }, 800);
  }

  function addSuggestedPerson() {
    if (!nextSuggestedPerson) return;
    setTeamDirectory((current) => [...current, nextSuggestedPerson]);
    setActivePersonId(nextSuggestedPerson.id);
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || loadingMode) return;

    if (mode === "ai") {
      await sendAiMessage(clean, currentConversation.id);
      return;
    }

    sendTeamMessage(clean, currentConversation.id);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void send(prompt);
  }

  function messageClass(message: Message) {
    if (message.speaker === "assistant") return "tk-msg tk-msg--ai";
    if (message.speaker === "teammate") return "tk-msg tk-msg--teammate";
    if (message.speaker === "system") return "tk-msg tk-msg--system";
    return "tk-msg tk-msg--user";
  }

  return (
    <div className="tk-chat-screen">
      <div className="tk-chat-screen__main">
        <div className="tk-chat-fullscreen">
          <div className="tk-chat-fullscreen__head">
            <div className="tk-chat-fullscreen__identity">
              <div className={`tk-chat-panel__avatar ${mode === "team" ? "is-team" : "is-logo"}`}>
                {mode === "ai" ? (
                  <Image alt="Chertt" className="tk-chat-panel__logo" height={30} priority src="/logo.png" width={30} />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <circle cx="9" cy="9" r="3" />
                    <circle cx="16.5" cy="10.5" r="2.5" />
                    <path d="M4.5 19a5 5 0 0 1 9 0M13.5 18.5a4 4 0 0 1 6 0" />
                  </svg>
                )}
              </div>
              <div className="tk-chat-panel__identity">
                {mode === "ai" ? null : <strong>{activePerson?.name ?? "Business Toolkit Team"}</strong>}
                <span>
                  {mode === "ai"
                    ? "AI-powered operations assistant"
                    : activePerson
                      ? `${activePerson.title} • ${activePerson.unit}`
                      : "Operations, admin, and finance thread"}
                </span>
                <small className="tk-chat-panel__meta">
                  {mode === "ai"
                    ? "Drafts, requests, reports, and process lookups."
                    : activePerson
                      ? `Direct team thread • ${activePerson.phone}`
                      : "Follow-ups, owners, approvals, and handoffs."}
                </small>
              </div>
            </div>

            <div className="tk-chat-mode">
              <button
                className={`tk-chat-mode__item ${mode === "ai" ? "is-active" : ""}`}
                onClick={() => setMode("ai")}
                type="button"
              >
                AI mode
              </button>
              <button
                className={`tk-chat-mode__item ${mode === "team" ? "is-active" : ""}`}
                onClick={() => setMode("team")}
                type="button"
              >
                Team chat
              </button>
            </div>
          </div>

          <div className="tk-chat__prompt-strip">
            <p className="tk-chat__prompt-label">{mode === "ai" ? "Try asking" : "Start with"}</p>
            <div className="tk-chat__suggestions tk-chat__suggestions--immersive">
              {visiblePrompts.map((item) => (
                <button className="tk-chat__chip" key={item} onClick={() => void send(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="tk-chat__thread tk-chat__thread--fullscreen" ref={threadRef}>
            {visibleTranscript.map((message) => (
              <div className={messageClass(message)} key={message.id}>
                {message.speaker !== "system" ? renderMessageAvatar(message, userInitials) : null}
                {message.speaker === "teammate" ? <span className="tk-msg__sender">{activePerson?.name ?? "Team"}</span> : null}
                {message.speaker === "system" ? <span className="tk-msg__sender">System</span> : null}
                <div className="tk-msg__bubble">
                  {(() => {
                    const parsed = extractActionCardFromMessage(message.text);
                    return (
                      <>
                        {renderMessageText(parsed.body)}
                        {parsed.card ? (
                          <Link className="tk-msg__action-card" href={parsed.card.href}>
                            <span className="tk-msg__action-kind">{parsed.card.kind}</span>
                            <strong className="tk-msg__action-title">{parsed.card.title}</strong>
                            {parsed.card.note ? <p className="tk-msg__action-note">{parsed.card.note}</p> : null}
                            <span className="tk-msg__action-cta">{parsed.card.cta}</span>
                          </Link>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
                <span className="tk-msg__meta">
                  <span className="tk-msg__time">{message.timeLabel}</span>
                  {message.speaker === "user" ? (
                    <span className="tk-msg__status" aria-label="Delivered">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m4.5 10 2.2 2.2 4.1-4.4" />
                        <path d="m9.4 10 2.2 2.2 4.1-4.4" />
                      </svg>
                    </span>
                  ) : null}
                </span>
              </div>
            ))}

            {loadingMode ? (
              <div className={mode === "ai" ? "tk-msg tk-msg--ai" : "tk-msg tk-msg--teammate"}>
                {mode === "ai" ? renderMessageAvatar({ id: "loading", speaker: "assistant", text: "", timeLabel: "" }, userInitials) : null}
                {mode === "team" ? renderMessageAvatar({ id: "loading-team", speaker: "teammate", text: "", timeLabel: "" }, userInitials) : null}
                {mode === "team" ? <span className="tk-msg__sender">Team</span> : null}
                <div className="tk-msg__bubble">
                  <div className="tk-msg__typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <form className="tk-chat__bar tk-chat__bar--fullscreen" onSubmit={handleSubmit}>
            <label className="tk-chat__composer-shell">
              <input
                aria-label={mode === "ai" ? "Message Chertt AI" : "Message the team"}
                className="tk-chat__input"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={mode === "ai" ? "Type what you need Chertt to do..." : "Write to the team..."}
                type="text"
                value={prompt}
              />
            </label>
            <button aria-label="Send" className="tk-chat__send" disabled={!prompt.trim() || !!loadingMode} type="submit">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.4 20.4 20.85 12 3.4 3.6l.85 6.95L16 12l-11.75 1.45L3.4 20.4Z" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {mode === "ai" && lastResult && latestAction ? (
        <aside className="tk-chat-process-panel" aria-label="Current process">
          <div className="tk-chat-review">
            <div className="tk-chat-review__header">
              <div className="tk-chat-review__copy">
                <p className="tk-eyebrow">Ready to review</p>
                <strong className="tk-chat-review__title">{latestAction.title}</strong>
                <p className="tk-muted-note">{latestAction.note}</p>
              </div>
              <div className="tk-chat-review__actions">
                <Link className="tk-inline-link" href={latestAction.href}>
                  {latestAction.actionLabel}
                </Link>
                <button className="tk-chat__chip" onClick={() => void send(`Revise ${latestAction.title}`)} type="button">
                  Revise
                </button>
              </div>
            </div>

            {lastResult.artifact ? (
              <div className="tk-chat-review__artifact">
                <div className="tk-chat-review__artifact-head">
                  <span className="tk-badge">{lastResult.artifact.kind}</span>
                  <span className="tk-chat-review__status">Latest output</span>
                </div>
                <strong className="tk-chat-review__artifact-title">{lastResult.artifact.headline}</strong>
                <p className="tk-chat-review__artifact-note">{lastResult.artifact.supportingText}</p>
              </div>
            ) : null}

            <div className="tk-chat-review__summary">
              <div className="tk-soft-tile">
                <strong>Next step</strong>
                <p>Open this item to review the details and move the work forward.</p>
              </div>
              <div className="tk-soft-tile">
                <strong>Need changes?</strong>
                <p>Use revise to adjust the draft without restarting the conversation.</p>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {mode === "team" ? (
        <aside className="tk-chat-team-panel" aria-label="Team contacts">
          <div className="tk-chat-team-panel__head">
            <div>
              <p className="tk-eyebrow">People</p>
              <strong className="tk-chat-review__title">Message a teammate</strong>
            </div>
            <button className="tk-inline-link" disabled={!nextSuggestedPerson} onClick={addSuggestedPerson} type="button">
              {nextSuggestedPerson ? "Add user" : "All added"}
            </button>
          </div>

          <label className="tk-chat-team-panel__search">
            <input
              onChange={(event) => setTeamSearch(event.target.value)}
              placeholder="Search name, team, or role"
              type="search"
              value={teamSearch}
            />
          </label>

          <div className="tk-chat-team-panel__list">
            {filteredTeamPeople.map((person) => (
              <button
                className={`tk-chat-team-card ${person.id === activePersonId ? "is-active" : ""}`}
                key={person.id}
                onClick={() => setActivePersonId(person.id)}
                type="button"
              >
                <span className="tk-chat-team-card__avatar">
                  {person.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span className="tk-chat-team-card__body">
                  <strong>{person.name}</strong>
                  <span>{person.title}</span>
                  <small>{person.unit}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
