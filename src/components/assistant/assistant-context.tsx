"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AssistantWidget } from "./AssistantWidget";
import styles from "./assistant.module.css";

type AssistantCtx = {
  open: boolean;
  openAssistant: (prefill?: string) => void;
  closeAssistant: () => void;
};

const AssistantContext = createContext<AssistantCtx>({
  open: false,
  openAssistant: () => {},
  closeAssistant: () => {},
});

export function useAssistantCtx() {
  return useContext(AssistantContext);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>();
  const pathname = usePathname();

  // Restore open state from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("chertt-assistant-open");
      if (stored === "true") setOpen(true);
    } catch { /* ignore */ }
  }, []);

  // Persist open state
  useEffect(() => {
    try {
      sessionStorage.setItem("chertt-assistant-open", String(open));
    } catch { /* ignore */ }
  }, [open]);

  // Body scroll lock on mobile when panel is open
  useEffect(() => {
    if (open && typeof window !== "undefined" && window.innerWidth <= 500) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const openAssistant = useCallback((p?: string) => {
    setPrefill(p);
    setOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setOpen(false);
    setPrefill(undefined);
  }, []);

  // Hide bubble on /chat path (chat has its own interface)
  const isChatPage = pathname.endsWith("/chat");

  return (
    <AssistantContext.Provider value={{ open, openAssistant, closeAssistant }}>
      {children}

      {/* Floating bubble — hidden on chat page */}
      {!isChatPage && !open && (
        <button
          className={styles["asst-bubble"]}
          aria-label="Ask Chertt"
          onClick={() => setOpen(true)}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
          </svg>
        </button>
      )}

      {/* Panel + backdrop */}
      {open && (
        <>
          <div
            className={`${styles["asst-backdrop"]}${open ? ` ${styles["is-open"]}` : ""}`}
            onClick={closeAssistant}
          />
          <AssistantWidget prefill={prefill} />
        </>
      )}
    </AssistantContext.Provider>
  );
}
