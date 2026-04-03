"use client";

import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  notify: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function createToastId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((input: ToastInput) => {
    const nextToast: Toast = {
      id: createToastId(),
      title: input.title,
      description: input.description,
      tone: input.tone || "info",
    };

    setToasts((current) => [nextToast, ...current].slice(0, 4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== nextToast.id));
    }, 4200);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="app-toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <article className={`app-toast app-toast--${toast.tone}`} key={toast.id} role="status">
            <strong>{toast.title}</strong>
            {toast.description ? <p>{toast.description}</p> : null}
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

