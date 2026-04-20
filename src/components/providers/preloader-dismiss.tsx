"use client";

import { useEffect } from "react";

/**
 * Dismisses the global #ch-preloader after React hydrates on pages that
 * don't include WorkspaceShell (e.g. auth, onboarding, landing).
 */
export function PreloaderDismiss() {
  useEffect(() => {
    const el = document.getElementById("ch-preloader");
    if (!el) return;
    if (el.getAttribute("data-dismissed") === "true") return;
    el.setAttribute("data-dismissed", "true");
    el.classList.add("ch-preloader-out");
    const t = setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 350);
    return () => clearTimeout(t);
  }, []);

  return null;
}
