"use client";

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useReducer, useRef } from "react";

import {
  loadWorkspaceSnapshotFromSupabase,
  persistAiResult,
  persistApprovedRequest,
  persistConversationMessage,
  subscribeToWorkspaceSnapshot,
} from "@/lib/services/supabase-workspace";
import type {
  Appointment,
  AiCommandResult,
  Conversation,
  FormDefinition,
  InventoryItem,
  Message,
  Notification,
  SmartDocument,
  WorkspaceSnapshot,
  WorkflowRequest,
} from "@/lib/types";

type AppAction =
  | { type: "hydrate"; snapshot: WorkspaceSnapshot }
  | { type: "approve-request"; requestId: string }
  | { type: "add-message"; conversationId: string; message: Message }
  | { type: "read-notifications" }
  | { type: "apply-ai-result"; result: AiCommandResult }
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

      return {
        ...state,
        documents,
        requests,
        appointments,
        forms,
        paymentLinks: action.result.generatedPaymentLink
          ? [action.result.generatedPaymentLink, ...state.paymentLinks]
          : state.paymentLinks,
        notifications,
      };
    }
    case "add-inventory-item":
      return { ...state, inventory: [action.item, ...state.inventory] };
    default:
      return state;
  }
}

interface AppStateContextValue {
  snapshot: WorkspaceSnapshot;
  primaryConversation: Conversation;
  approveRequest: (requestId: string) => void;
  addMessage: (conversationId: string, message: Message) => void;
  markNotificationsRead: () => void;
  applyAiResult: (result: AiCommandResult) => void;
  addInventoryItem: (item: InventoryItem) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({
  children,
  initialSnapshot,
}: PropsWithChildren<{ initialSnapshot: WorkspaceSnapshot }>) {
  const [snapshot, dispatch] = useReducer(reducer, initialSnapshot);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function hydrateFromSupabase() {
      const remoteSnapshot = await loadWorkspaceSnapshotFromSupabase(initialSnapshot.workspace.slug);

      if (!cancelled && remoteSnapshot) {
        dispatch({ type: "hydrate", snapshot: remoteSnapshot });
      }

      unsubscribe = await subscribeToWorkspaceSnapshot(initialSnapshot.workspace.slug, (nextSnapshot) => {
        if (!cancelled) {
          dispatch({ type: "hydrate", snapshot: nextSnapshot });
        }
      });
    }

    void hydrateFromSupabase();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [initialSnapshot.workspace.slug]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      snapshot,
      primaryConversation: snapshot.conversations[0],
      approveRequest: (requestId) => {
        dispatch({ type: "approve-request", requestId });
        void persistApprovedRequest(snapshotRef.current, requestId);
      },
      addMessage: (conversationId, message) => {
        dispatch({ type: "add-message", conversationId, message });
        const conversation = snapshotRef.current.conversations.find((item) => item.id === conversationId);
        if (conversation) {
          void persistConversationMessage(snapshotRef.current, conversation, message);
        }
      },
      markNotificationsRead: () => {
        dispatch({ type: "read-notifications" });
      },
      applyAiResult: (result) => {
        dispatch({ type: "apply-ai-result", result });
        void persistAiResult(snapshotRef.current, result);
      },
      addInventoryItem: (item) => {
        dispatch({ type: "add-inventory-item", item });
      },
    }),
    [snapshot],
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
