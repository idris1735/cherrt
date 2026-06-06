"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import styles from "./ui.module.css";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, handleEsc]);

  if (!open) return null;

  return (
    <div
      className={styles["ui-modal-backdrop"]}
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className={styles["ui-modal"]} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles["ui-modal-header"]}>
          <span className={styles["ui-modal-title"]}>{title}</span>
          <button className={styles["ui-modal-close"]} onClick={onClose} aria-label="Close" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: "16px", height: "16px" }}>
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className={styles["ui-modal-body"]}>{children}</div>
        {footer ? <div className={styles["ui-modal-footer"]}>{footer}</div> : null}
      </div>
    </div>
  );
}