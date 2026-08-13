"use client";

import { useEffect, useState } from "react";

type ToastItem = { id: number; message: string; type: "success" | "error" };

declare global {
  interface WindowEventMap {
    "chertt:toast": CustomEvent<{ message: string; type?: "success" | "error" }>;
  }
}

let nextId = 1;

/** Fire a toast from anywhere (client-side only). */
export function toast(message: string, type: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent("chertt:toast", { detail: { message, type } }));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; type?: "success" | "error" }>).detail;
      const id = nextId++;
      setItems((xs) => [...xs, { id, message: detail.message, type: detail.type ?? "success" }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3000);
    };
    window.addEventListener("chertt:toast", onToast);
    return () => window.removeEventListener("chertt:toast", onToast);
  }, []);

  return (
    <div className="toast-container" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{t.type === "success" ? "✓" : "✕"}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
