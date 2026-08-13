"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/app/admin/use-admin-fetch";

type Result = { churches: { id: string; name: string; href: string }[]; people: { id: string; name: string; href: string }[] };
type Item = { name: string; href: string; kind: "church" | "person" };

/** ⌘K / Ctrl+K command palette — jumps to any church or person via the real search endpoint. */
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

  const items: Item[] = [
    ...results.churches.map((c) => ({ ...c, kind: "church" as const })),
    ...results.people.map((p) => ({ ...p, kind: "person" as const })),
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

  return (
    <div className={`cmd-palette-overlay ${open ? "open" : ""}`} onClick={onClose} role="dialog" aria-modal="true" aria-label="Jump to a church or person">
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="cmd-palette-input"
          placeholder="Search churches, people…"
          autoComplete="off"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          aria-label="Search churches and people"
        />
        <div className="cmd-palette-results">
          {!q.trim() && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Type a church or person name.</div>}
          {q.trim() && items.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No results found</div>}
          {items.length > 0 && (
            <div className="cmd-palette-group">
              <div className="cmd-palette-group-title">Results</div>
              {items.map((it, i) => (
                <div
                  key={it.href}
                  className={`cmd-palette-item ${i === sel ? "selected" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(it.href)}
                >
                  <span className="cmd-icon">{it.kind === "church" ? "⛪" : "👤"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }} className="truncate">{it.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }} className="truncate">{it.kind === "church" ? "Church" : "Person"}</div>
                  </div>
                  <span className="cmd-meta">Go →</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="cmd-palette-footer">
          <span><kbd>↑↓</kbd> Navigate</span><span><kbd>↵</kbd> Select</span><span><kbd>esc</kbd> Close</span>
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