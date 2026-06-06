"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/components/providers/app-state-provider";
import { getActiveUserProfile } from "@/lib/services/profile";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { AiCommandResult, WorkspaceSnapshot } from "@/lib/types";

export type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  ts: number;
  /** If the assistant created a record, store a compact action card. */
  actionCard?: {
    kind: string;
    recordId?: string;
    title: string;
    note: string;
    href: string;
    cta: string;
  };
};

function buildMemoryContext(snapshot: WorkspaceSnapshot): string {
  const { documents, requests, expenses, issues, appointments, paymentLinks, giving, careRequests } = snapshot;
  const cur = snapshot.workspace.currency;
  const lines: string[] = [];
  if (documents.length) lines.push(`Documents: ${documents.slice(0, 8).map((d) => `"${d.title}" [${d.type}, ${d.status}]`).join(", ")}`);
  if (requests.length) lines.push(`Requests: ${requests.slice(0, 8).map((r) => `"${r.title}" [${r.type}, ${r.status}${r.amount ? `, ${r.amount}` : ""}]`).join(", ")}`);
  if (expenses.length) lines.push(`Expenses: ${expenses.slice(0, 8).map((e) => `"${e.title}" [${e.department}, ${e.amount}, ${e.status}]`).join(", ")}`);
  if (issues.length) lines.push(`Issues: ${issues.slice(0, 6).map((i) => `"${i.title}" [${i.area}, ${i.severity}, ${i.status}]`).join(", ")}`);
  const profile = typeof window !== "undefined" ? getActiveUserProfile() : null;
  if (profile) {
    const parts = [`Name: ${profile.fullName}`];
    if (profile.jobTitle) parts.push(`Title: ${profile.jobTitle}`);
    lines.push(`User profile: ${parts.join(", ")}`);
  }
  lines.push(`Workspace: ${snapshot.workspace.name}, ${snapshot.workspace.city}`);
  return lines.join("\n");
}

export function useAssistant() {
  const { snapshot, applyAiResult } = useAppState();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [sending, setSending] = useState(false);
  const loadedRef = useRef(false);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = sessionStorage.getItem("chertt-assistant-msgs");
      if (raw) {
        const parsed = JSON.parse(raw) as AssistantMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist to sessionStorage
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      sessionStorage.setItem("chertt-assistant-msgs", JSON.stringify(messages.slice(-50)));
    } catch { /* ignore */ }
  }, [messages]);

  function buildActionCard(payload: AiCommandResult, base: string): AssistantMessage["actionCard"] | undefined {
    if (payload.generatedDocument) {
      return { kind: "document", recordId: payload.generatedDocument.id, title: payload.generatedDocument.title, note: payload.generatedDocument.type, href: `${base}/documents/${payload.generatedDocument.id}`, cta: "View document" };
    }
    if (payload.generatedRequest) {
      return { kind: "request", recordId: payload.generatedRequest.id, title: payload.generatedRequest.title, note: payload.generatedRequest.type, href: `${base}/requests/${payload.generatedRequest.id}`, cta: "View request" };
    }
    if (payload.generatedExpenseEntry) {
      return { kind: "expense", recordId: payload.generatedExpenseEntry.id, title: payload.generatedExpenseEntry.title, note: `₦${payload.generatedExpenseEntry.amount.toLocaleString()}`, href: `${base}/expenses/${payload.generatedExpenseEntry.id}`, cta: "View expense" };
    }
    if (payload.generatedIssueReport) {
      return { kind: "issue", recordId: payload.generatedIssueReport.id, title: payload.generatedIssueReport.title, note: payload.generatedIssueReport.severity, href: `${base}/issues/${payload.generatedIssueReport.id}`, cta: "View issue" };
    }
    if (payload.generatedInventoryItem) {
      return { kind: "inventory", recordId: payload.generatedInventoryItem.id, title: payload.generatedInventoryItem.name, note: `${payload.generatedInventoryItem.inStock} in stock`, href: `${base}/inventory/${payload.generatedInventoryItem.id}`, cta: "View item" };
    }
    if (payload.generatedForm) {
      return { kind: "form", recordId: payload.generatedForm.id, title: payload.generatedForm.name, note: "Form created", href: `${base}/forms/${payload.generatedForm.id}`, cta: "View form" };
    }
    if (payload.generatedPoll) {
      return { kind: "poll", recordId: payload.generatedPoll.id, title: payload.generatedPoll.title, note: payload.generatedPoll.lane, href: `${base}/feedback/${payload.generatedPoll.id}`, cta: "View poll" };
    }
    if (payload.generatedAppointment) {
      return { kind: "appointment", recordId: payload.generatedAppointment.id, title: payload.generatedAppointment.title, note: payload.generatedAppointment.when, href: `${base}/appointments/${payload.generatedAppointment.id}`, cta: "View" };
    }
    if (payload.generatedPerson) {
      return { kind: "directory", recordId: payload.generatedPerson.id, title: payload.generatedPerson.name, note: payload.generatedPerson.title, href: `${base}/directory/${payload.generatedPerson.id}`, cta: "View" };
    }
    return undefined;
  }

  const sendMessage = useCallback(
    async (prompt: string) => {
      const clean = prompt.trim();
      if (!clean || sending) return;

      const now = Date.now();
      const userMsg: AssistantMessage = { role: "user", text: clean, ts: now };
      setMessages((prev) => [...prev, userMsg]);
      setSending(true);

      try {
        const supabase = getSupabaseBrowserClient();
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

        const res = await fetch("/api/command", {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: clean,
            confirmed: false,
            context: {
              role: snapshot.membership.role,
              enabledModules: snapshot.workspace.modules,
              workspaceSlug: snapshot.workspace.slug,
              userName: snapshot.membership.userName,
              userTitle: snapshot.membership.title,
              userOrganization: snapshot.workspace.name,
            },
            history: messages.slice(-6).map((m) => ({ speaker: m.role, text: m.text })),
            memoryContext: buildMemoryContext(snapshot),
          }),
        });

        if (!res.ok) throw new Error("Command failed");

        const payload = (await res.json()) as AiCommandResult;

        if (payload.pendingConfirmation) {
          const confirmMsg: AssistantMessage = {
            role: "assistant",
            text: payload.reply || `I'll create *"${payload.pendingConfirmation.previewTitle}"*. Reply CONFIRM to proceed or CANCEL to stop.`,
            ts: Date.now(),
          };
          setMessages((prev) => [...prev, confirmMsg]);
          setSending(false);
          return;
        }

        const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;
        const card = buildActionCard(payload, base);

        applyAiResult(payload);

        const assistantMsg: AssistantMessage = {
          role: "assistant",
          text: payload.reply || "Done.",
          ts: Date.now(),
          actionCard: card,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errMsg: AssistantMessage = {
          role: "assistant",
          text: "Sorry, something went wrong. Please try again.",
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setSending(false);
      }
    },
    [sending, snapshot, messages, applyAiResult],
  );

  return { messages, sending, sendMessage };
}
