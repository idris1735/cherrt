"use client";

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  deleteConversationFromSupabase,
  loadWorkspaceSnapshotFromSupabase,
  persistAiResult,
  persistApprovedRequest,
  persistConversation,
  persistConversationMessage,
  persistSmartDocumentDraft,
  subscribeToWorkspaceSnapshot,
} from "@/lib/services/supabase-workspace";
import { getActiveUserProfile } from "@/lib/services/profile";
import type {
  Appointment,
  AiCommandResult,
  Conversation,
  ExpenseEntry,
  FeedbackPoll,
  FormDefinition,
  GivingRecord,
  InventoryItem,
  IssueReport,
  Message,
  Notification,
  Person,
  SmartDocument,
  WorkspaceSnapshot,
  WorkflowRequest,
} from "@/lib/types";

type AppAction =
  | { type: "hydrate"; snapshot: WorkspaceSnapshot }
  | { type: "approve-request"; requestId: string }
  | { type: "create-conversation"; conversation: Conversation }
  | { type: "rename-conversation"; conversationId: string; title: string }
  | { type: "delete-conversation"; conversationId: string }
  | { type: "add-message"; conversationId: string; message: Message }
  | { type: "read-notifications" }
  | { type: "apply-ai-result"; result: AiCommandResult }
  | { type: "upsert-document"; document: SmartDocument }
  | { type: "add-inventory-item"; item: InventoryItem };

function reducer(state: WorkspaceSnapshot, action: AppAction): WorkspaceSnapshot {
  switch (action.type) {
    case "hydrate":
      return action.snapshot;
    case "approve-request":
      return {
        ...state,
        requests: state.requests.map((request) =>
          request.id === action.requestId
            ? {
                ...request,
                status: "approved",
                approvalSteps: request.approvalSteps.map((step, index) =>
                  index === request.approvalSteps.length - 1 ? { ...step, completed: true, dueLabel: "Done" } : step,
                ),
              }
            : request,
        ),
        notifications: [
          {
            id: `notif-${Date.now()}`,
            kind: "system",
            title: "Approval recorded",
            detail: "A workflow item moved to approved.",
            timeLabel: "Now",
            read: false,
          },
          ...state.notifications,
        ],
      };
    case "add-message":
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.conversationId
            ? { ...conversation, messages: [...conversation.messages, action.message] }
            : conversation,
          ),
      };
    case "create-conversation":
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
      };
    case "rename-conversation":
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.conversationId ? { ...conversation, title: action.title } : conversation,
        ),
      };
    case "delete-conversation":
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.conversationId),
      };
    case "read-notifications":
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.read ? notification : { ...notification, read: true },
        ),
      };
    case "apply-ai-result": {
      const notifications: Notification[] = [...state.notifications];
      const documents: SmartDocument[] = [...state.documents];
      const requests: WorkflowRequest[] = [...state.requests];
      const appointments: Appointment[] = [...state.appointments];
      const forms: FormDefinition[] = [...state.forms];
      const inventory: InventoryItem[] = [...state.inventory];
      const issues: IssueReport[] = [...state.issues];
      const expenses: ExpenseEntry[] = [...state.expenses];
      const polls: FeedbackPoll[] = [...state.polls];
      const directory: Person[] = [...state.directory];
      const giving: GivingRecord[] = [...state.giving];

      if (action.result.generatedDocument) {
        documents.unshift(action.result.generatedDocument);
        notifications.unshift({
          id: `notif-doc-${Date.now()}`,
          kind: "message",
          title: "New smart document drafted",
          detail: action.result.generatedDocument.title,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedRequest) {
        requests.unshift(action.result.generatedRequest);
        notifications.unshift({
          id: `notif-req-${Date.now()}`,
          kind: "approval",
          title: "Approval workflow created",
          detail: action.result.generatedRequest.title,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedAppointment) {
        appointments.unshift(action.result.generatedAppointment);
        notifications.unshift({
          id: `notif-appt-${Date.now()}`,
          kind: "system",
          title: "Appointment scheduled",
          detail: action.result.generatedAppointment.title,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedForm) {
        forms.unshift(action.result.generatedForm);
        notifications.unshift({
          id: `notif-form-${Date.now()}`,
          kind: "system",
          title: "Form prepared",
          detail: action.result.generatedForm.name,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedInventoryItem) {
        inventory.unshift(action.result.generatedInventoryItem);
        notifications.unshift({
          id: `notif-inventory-${Date.now()}`,
          kind: "system",
          title: "Inventory item added",
          detail: action.result.generatedInventoryItem.name,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedIssueReport) {
        issues.unshift(action.result.generatedIssueReport);
        notifications.unshift({
          id: `notif-issue-${Date.now()}`,
          kind: "system",
          title: "Issue report logged",
          detail: action.result.generatedIssueReport.title,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedExpenseEntry) {
        expenses.unshift(action.result.generatedExpenseEntry);
        notifications.unshift({
          id: `notif-expense-${Date.now()}`,
          kind: "system",
          title: "Expense entry logged",
          detail: action.result.generatedExpenseEntry.title,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedPoll) {
        polls.unshift(action.result.generatedPoll);
        notifications.unshift({
          id: `notif-poll-${Date.now()}`,
          kind: "system",
          title: "Feedback poll created",
          detail: action.result.generatedPoll.title,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedPerson) {
        directory.unshift(action.result.generatedPerson);
        notifications.unshift({
          id: `notif-directory-${Date.now()}`,
          kind: "system",
          title: "Directory profile added",
          detail: action.result.generatedPerson.name,
          timeLabel: "Now",
          read: false,
        });
      }

      if (action.result.generatedGivingRecord) {
        giving.unshift(action.result.generatedGivingRecord);
        notifications.unshift({
          id: `notif-giving-${Date.now()}`,
          kind: "payment",
          title: "Giving record created",
          detail: `${action.result.generatedGivingRecord.givingType || "Donation"} to ${action.result.generatedGivingRecord.churchName || "church"}`,
          timeLabel: "Now",
          read: false,
        });
      }

      return {
        ...state,
        documents,
        requests,
        appointments,
        forms,
        inventory,
        issues,
        expenses,
        polls,
        directory,
        giving,
        paymentLinks: action.result.generatedPaymentLink
          ? [action.result.generatedPaymentLink, ...state.paymentLinks]
          : state.paymentLinks,
        notifications,
      };
    }
    case "add-inventory-item":
      return { ...state, inventory: [action.item, ...state.inventory] };
    case "upsert-document": {
      const existingIndex = state.documents.findIndex((document) => document.id === action.document.id);
      if (existingIndex < 0) {
        return { ...state, documents: [action.document, ...state.documents] };
      }

      return {
        ...state,
        documents: state.documents.map((document) => (document.id === action.document.id ? action.document : document)),
      };
    }
    default:
      return state;
  }
}

interface AppStateContextValue {
  snapshot: WorkspaceSnapshot;
  primaryConversation: Conversation;
  workspaceHydrated: boolean;
  approveRequest: (requestId: string) => void;
  createConversation: (mode?: Conversation["mode"]) => string;
  renameConversation: (conversationId: string, title: string) => void;
  deleteConversation: (conversationId: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  markNotificationsRead: () => void;
  applyAiResult: (result: AiCommandResult) => void;
  upsertDocument: (document: SmartDocument) => void;
  addInventoryItem: (item: InventoryItem) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

const ACTIVE_PROFILE_KEY = "chertt:active-profile";
const AUTO_TITLE_PATTERN = /^(new chat(?: \d+)?|team chat(?: \d+)?)$/i;

// ── Per-user conversation deletion tracking ──────────────────────────────────
// Stores IDs of conversations the current user has explicitly deleted.
// Keyed by user identity + workspace so deletions survive page refreshes even
// when Supabase is not configured and the app falls back to seed data.

function deletedConvsStorageKey(workspaceSlug: string): string {
  const profile = typeof window !== "undefined" ? getActiveUserProfile() : null;
  const userKey = profile?.email ?? profile?.fullName ?? "anon";
  return `chertt:deleted-convs:${userKey}:${workspaceSlug}`;
}

function getDeletedConvIds(workspaceSlug: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(deletedConvsStorageKey(workspaceSlug));
    return new Set((JSON.parse(raw ?? "[]") as string[]));
  } catch {
    return new Set();
  }
}

function markConvDeleted(workspaceSlug: string, conversationId: string) {
  if (typeof window === "undefined") return;
  const existing = getDeletedConvIds(workspaceSlug);
  existing.add(conversationId);
  window.localStorage.setItem(deletedConvsStorageKey(workspaceSlug), JSON.stringify([...existing]));
}

function filterDeletedConvs(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const deleted = getDeletedConvIds(snapshot.workspace.slug);
  if (!deleted.size) return snapshot;
  return {
    ...snapshot,
    conversations: snapshot.conversations.filter((c) => !deleted.has(c.id)),
  };
}

function applyProfile(snapshot: WorkspaceSnapshot) {
  const profile = getActiveUserProfile();
  if (!profile) {
    return snapshot;
  }

  return {
    ...snapshot,
    workspace: {
      ...snapshot.workspace,
      currency: profile.currency ?? snapshot.workspace.currency,
    },
    membership: {
      ...snapshot.membership,
      userName: profile.fullName,
      avatarInitials: profile.initials,
      email: profile.email ?? snapshot.membership.email,
    },
  };
}

function shouldAutoTitleConversation(conversationTitle: string) {
  return AUTO_TITLE_PATTERN.test(conversationTitle.trim());
}

function buildConversationTitleFromMessage(messageText: string, mode: Conversation["mode"]) {
  const firstLine = messageText.split("\n")[0]?.trim() ?? "";
  const clean = firstLine
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .trim();

  if (!clean) {
    return mode === "team" ? "Team chat" : "New chat";
  }

  const words = clean.split(" ").filter(Boolean).slice(0, 7);
  const joined = words.join(" ").trim();
  const capped = joined.length > 48 ? `${joined.slice(0, 48).trimEnd()}...` : joined;
  const title = capped.charAt(0).toUpperCase() + capped.slice(1);

  return title || (mode === "team" ? "Team chat" : "New chat");
}

export function AppStateProvider({
  children,
  initialSnapshot,
}: PropsWithChildren<{ initialSnapshot: WorkspaceSnapshot }>) {
  const [snapshot, dispatch] = useReducer(reducer, initialSnapshot);
  const [profileTick, setProfileTick] = useState(0);
  const [profileReady, setProfileReady] = useState(false);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === ACTIVE_PROFILE_KEY) {
        setProfileTick((current) => current + 1);
      }
    };
    const localListener = () => {
      setProfileTick((current) => current + 1);
    };

    window.addEventListener("storage", listener);
    window.addEventListener("chertt-profile-updated", localListener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("chertt-profile-updated", localListener);
    };
  }, []);

  useEffect(() => {
    setProfileReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function hydrateFromSupabase() {
      try {
        const remoteSnapshot = await loadWorkspaceSnapshotFromSupabase(initialSnapshot.workspace.slug);

        if (!cancelled && remoteSnapshot) {
          dispatch({ type: "hydrate", snapshot: filterDeletedConvs(remoteSnapshot) });
        } else if (!cancelled) {
          // Supabase not available — filter deletions from initial seed data
          dispatch({ type: "hydrate", snapshot: filterDeletedConvs(snapshot) });
        }

        unsubscribe = await subscribeToWorkspaceSnapshot(initialSnapshot.workspace.slug, (nextSnapshot) => {
          if (!cancelled) {
            dispatch({ type: "hydrate", snapshot: filterDeletedConvs(nextSnapshot) });
          }
        });
      } finally {
        if (!cancelled) {
          setWorkspaceHydrated(true);
        }
      }
    }

    void hydrateFromSupabase();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [initialSnapshot.workspace.slug]);

  const personalizedSnapshot = useMemo(
    () => (profileReady ? applyProfile(snapshot) : snapshot),
    [profileReady, profileTick, snapshot],
  );

const value = useMemo<AppStateContextValue>(
    () => ({
      snapshot: personalizedSnapshot,
      primaryConversation:
        personalizedSnapshot.conversations[0] ?? { id: "fallback-conversation", title: "New chat", mode: "ai", messages: [] },
      workspaceHydrated,
      approveRequest: (requestId) => {
        dispatch({ type: "approve-request", requestId });
        void persistApprovedRequest(snapshotRef.current, requestId);
      },
      createConversation: (mode = "ai") => {
        const id = crypto.randomUUID();
        const conversation: Conversation = {
          id,
          mode,
          title: mode === "team" ? "Team chat" : "New chat",
          messages: [],
        };
        dispatch({ type: "create-conversation", conversation });
        void persistConversation(snapshotRef.current, conversation);
        return id;
      },
      renameConversation: (conversationId, title) => {
        dispatch({ type: "rename-conversation", conversationId, title });
        const conversation = snapshotRef.current.conversations.find((c) => c.id === conversationId);
        if (conversation) {
          void persistConversation(snapshotRef.current, { ...conversation, title });
        }
      },
      deleteConversation: (conversationId) => {
        dispatch({ type: "delete-conversation", conversationId });
        markConvDeleted(snapshotRef.current.workspace.slug, conversationId);
        void deleteConversationFromSupabase(snapshotRef.current, conversationId);
      },
      addMessage: (conversationId, message) => {
        dispatch({ type: "add-message", conversationId, message });
        const conversation = snapshotRef.current.conversations.find((item) => item.id === conversationId);
        if (conversation) {
          void persistConversationMessage(snapshotRef.current, conversation, message);

          if (message.speaker === "user" && shouldAutoTitleConversation(conversation.title)) {
            const nextTitle = buildConversationTitleFromMessage(message.text, conversation.mode);
            if (nextTitle && nextTitle !== conversation.title) {
              dispatch({ type: "rename-conversation", conversationId, title: nextTitle });
              void persistConversation(snapshotRef.current, { ...conversation, title: nextTitle });
            }
          }
        }
      },
      markNotificationsRead: () => {
        dispatch({ type: "read-notifications" });
      },
      applyAiResult: (result) => {
        dispatch({ type: "apply-ai-result", result });
        void persistAiResult(snapshotRef.current, result);
      },
      upsertDocument: (document) => {
        dispatch({ type: "upsert-document", document });
        void persistSmartDocumentDraft(snapshotRef.current, document);
      },
      addInventoryItem: (item) => {
        dispatch({ type: "add-inventory-item", item });
      },
    }),
    [personalizedSnapshot, workspaceHydrated],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }
  return context;
}
