"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "@/app/admin/use-admin-fetch";

type Result = { churches: { name: string; href: string }[]; people: { name: string; href: string }[] };

/** ⌘K / Ctrl+K command palette — jumps to any church or person. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result>({ churches: [], people: [] });
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults({ churches: [], people: [] });
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) { setResults({ churches: [], people: [] }); return; }
    const timer = setTimeout(() => {
      adminFetch<Result>(`/api/admin/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.data ?? { churches: [], people: [] }));
    }, 150);
    return () => clearTimeout(timer);
  }, [q, open]);

  const items = [
    ...results.churches.map((c) => ({ ...c, kind: "🏛", label: "Church" })),
    ...results.people.map((p) => ({ ...p, kind: "👤", label: "Person" })),
  ];

  const go = useCallback((href: string) => {
    onClose();
    router.push(href);
  }, [router, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(v + 1, items.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
      if (e.key === "Enter" && items[sel]) go(items[sel].href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, sel, go, onClose]);

  if (!open) return null;

  return (
    <div className={s.paletteOverlay} role="dialog" aria-modal="true" aria-label="Jump to a church or person" onClick={onClose}>
      <div className={s.palette} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={s.paletteInput}
          placeholder="Jump to a church or person…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          aria-label="Search churches and people"
        />
        <div className={s.paletteList}>
          {!q.trim() && <div className={s.paletteEmpty}>Type a church or person name.</div>}
          {q.trim() && items.length === 0 && <div className={s.paletteEmpty}>No matches.</div>}
          {items.map((it, i) => (
            <div
              key={it.href}
              className={`${s.paletteItem} ${i === sel ? s.paletteItemSel : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(it.href)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") go(it.href); }}
            >
              <span>{it.kind}</span>
              <span style={{ fontWeight: 600 }}>{it.name}</span>
              <span className={s.feedTime} style={{ marginLeft: "auto" }}>{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Global hook: opens the palette on ⌘K / Ctrl+K. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}