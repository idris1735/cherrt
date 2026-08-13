"use client";

/** Kimi-style confirm dialog — used for destructive/approval actions. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={`dialog-overlay ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p style={{ color: "var(--muted)" }}>{message}</p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Kimi-style photo zoom modal — real signed-URL documents only. */
export function PhotoModal({ src, onClose }: { src: string | null; onClose: () => void }) {
  return (
    <div className={`photo-modal-overlay ${src ? "open" : ""}`} onClick={onClose} role="dialog" aria-modal="true" aria-label="Document preview">
      <button className="photo-modal-close" onClick={onClose} aria-label="Close">×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img className="photo-modal-img" src={src} alt="Document preview" />}
    </div>
  );
}
