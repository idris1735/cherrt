"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";

import { useAppState } from "@/components/providers/app-state-provider";
import type { InventoryItem } from "@/lib/types";

function stockPercent(item: InventoryItem) {
  if (item.minLevel === 0) return 100;
  return Math.min(100, Math.round((item.inStock / (item.minLevel * 2)) * 100));
}

function stockColor(item: InventoryItem): string {
  const pct = stockPercent(item);
  if (pct <= 30) return "#c0432a";
  if (pct <= 60) return "#c08a20";
  return "#267a4f";
}

function inventoryTheme(item: InventoryItem) {
  const name = item.name.toLowerCase();
  if (name.includes("paper") || name.includes("toner")) return { accent: "#fa8300", tint: "#fff3e0", glow: "rgba(250,131,0,0.18)" };
  if (name.includes("microphone")) return { accent: "#8c6734", tint: "#fcf4e7", glow: "rgba(140,103,52,0.18)" };
  if (name.includes("tag")) return { accent: "#2f6f82", tint: "#ebf6fa", glow: "rgba(47,111,130,0.18)" };
  return { accent: "#705b45", tint: "#f4efe9", glow: "rgba(112,91,69,0.16)" };
}

function inventoryIcon(item: InventoryItem) {
  const name = item.name.toLowerCase();
  if (name.includes("paper") || name.includes("toner")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4.5h5l3 3V19.5H8A2.5 2.5 0 0 1 5.5 17V7A2.5 2.5 0 0 1 8 4.5Z" />
        <path d="M13 4.5v4h4M9 12h6M9 15h4" />
      </svg>
    );
  }
  if (name.includes("microphone")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4.5a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0V7A2.5 2.5 0 0 1 12 4.5Z" />
        <path d="M7.5 10.5a4.5 4.5 0 0 0 9 0M12 15v4M9.5 19h5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 8.5 12 4l7.5 4.5v7L12 20l-7.5-4.5v-7Z" />
      <path d="M12 11.5 19.5 8M12 11.5 4.5 8M12 11.5V20" />
    </svg>
  );
}

type ModalMode = "detail" | "add";

export default function ToolkitInventoryPage() {
  const { snapshot, addInventoryItem } = useAppState();
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("detail");
  const [form, setForm] = useState({ name: "", location: "", inStock: "", minLevel: "" });

  const items = [...snapshot.inventory].sort((a, b) => {
    const aLow = a.inStock <= a.minLevel ? 0 : 1;
    const bLow = b.inStock <= b.minLevel ? 0 : 1;
    return aLow - bLow;
  });

  const lowStock = items.filter((i) => i.inStock <= i.minLevel);
  const healthyCount = items.filter((i) => i.inStock > i.minLevel).length;
  const reservedCount = items.filter((i) => i.reserved > 0).length;

  function openAdd() {
    setForm({ name: "", location: "", inStock: "", minLevel: "" });
    setModalMode("add");
    setSelectedItem(null);
  }

  function openDetail(item: InventoryItem) {
    setSelectedItem(item);
    setModalMode("detail");
  }

  function closeModal() {
    setSelectedItem(null);
    setModalMode("detail");
  }

  function handleAdd() {
    if (!form.name.trim()) return;
    addInventoryItem({
      id: `inv-${Date.now()}`,
      name: form.name.trim(),
      location: form.location.trim() || "Main store",
      inStock: parseInt(form.inStock) || 0,
      minLevel: parseInt(form.minLevel) || 0,
      reserved: 0,
    });
    closeModal();
  }

  const isModalOpen = selectedItem !== null || modalMode === "add";

  return (
    <>
      <div className="tk-page">
        <div className="tk-page-head">
          <div className="tk-page-head__copy">
            <p className="tk-eyebrow">Store management</p>
            <h1 className="tk-page-title">Inventory</h1>
            <p className="tk-page-desc">
              Track stock, flag reorder needs, and approve releases.
              {lowStock.length > 0 ? ` ${lowStock.length} item${lowStock.length !== 1 ? "s" : ""} need attention.` : ""}
            </p>
          </div>
          <button className="button button--primary" onClick={openAdd} type="button">
            Add item
          </button>
        </div>

        <div className="tk-requests-summary">
          <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/inventory#stock-register`}>
            <span>Total items</span>
            <strong>{items.length}</strong>
          </Link>
          <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/inventory#stock-register`}>
            <span>Healthy</span>
            <strong>{healthyCount}</strong>
          </Link>
          <Link
            className={`tk-requests-summary__item tk-requests-summary__item--link${lowStock.length > 0 ? " tk-requests-summary__item--flagged" : ""}`}
            href={`${base}/inventory#${lowStock.length > 0 ? "low-stock" : "stock-register"}`}
          >
            <span>Need reorder</span>
            <strong>{lowStock.length}</strong>
          </Link>
          {reservedCount > 0 ? (
            <Link className="tk-requests-summary__item tk-requests-summary__item--link" href={`${base}/inventory#stock-register`}>
              <span>With reserves</span>
              <strong>{reservedCount}</strong>
            </Link>
          ) : null}
        </div>

        <div className="tk-layout-2 tk-layout-2--balanced">
          <div className="tk-card" id="stock-register">
            <div className="tk-card-head">
              <div className="tk-card-head__copy">
                <p className="tk-eyebrow">Stock register</p>
                <h2 className="tk-card-title">{items.length} items tracked</h2>
              </div>
              <div className="tk-requests-toolbar">
                {lowStock.length > 0 ? (
                  <span className="tk-badge tk-badge--high">{lowStock.length} low</span>
                ) : (
                  <span className="tk-badge tk-badge--low">All healthy</span>
                )}
              </div>
            </div>

            <div className="tk-inv-grid">
              {items.map((item) => {
                const isLow = item.inStock <= item.minLevel;
                const pct = stockPercent(item);
                const available = Math.max(item.inStock - item.reserved, 0);
                const theme = inventoryTheme(item);

                return (
                  <button
                    className={`tk-inv-card${isLow ? " tk-inv-card--low" : ""}`}
                    key={item.id}
                    onClick={() => openDetail(item)}
                    style={{ "--tk-inv-accent": theme.accent, "--tk-inv-tint": theme.tint, "--tk-inv-glow": theme.glow } as CSSProperties}
                    type="button"
                  >
                    <div className="tk-inv-card__media">
                      <span className="tk-inv-card__location">{item.location}</span>
                      <div className="tk-inv-card__glyph">{inventoryIcon(item)}</div>
                      <div className="tk-inv-card__media-copy">
                        <span>{isLow ? "Reorder" : "Healthy"}</span>
                        <strong>{item.inStock}</strong>
                      </div>
                    </div>

                    <div className="tk-inv-card__body">
                      <div className="tk-inv-card__head">
                        <div>
                          <strong>{item.name}</strong>
                          <p>
                            {available} available{item.reserved > 0 ? ` · ${item.reserved} reserved` : ""}
                          </p>
                        </div>
                        {isLow ? <span className="tk-badge tk-badge--high">Reorder</span> : <span className="tk-badge tk-badge--low">OK</span>}
                      </div>

                      <div className="tk-inv-bar">
                        <div className="tk-inv-bar__fill" style={{ width: `${pct}%`, background: stockColor(item) }} />
                      </div>

                      <div className="tk-inv-card__stats">
                        <div className="tk-inv-card__stat">
                          <span>In stock</span>
                          <strong>{item.inStock}</strong>
                        </div>
                        <div className="tk-inv-card__stat">
                          <span>Min level</span>
                          <strong>{item.minLevel}</strong>
                        </div>
                        <div className="tk-inv-card__stat">
                          <span>Reserved</span>
                          <strong>{item.reserved}</strong>
                        </div>
                      </div>

                      <div className="tk-inv-card__footer">
                        <span className="tk-inv-card__hint">Tap to view details and actions</span>
                        <span className="tk-inline-link" style={{ minHeight: "auto", padding: "0 10px", fontSize: "0.74rem" }}>
                          View →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {items.length === 0 ? (
                <div className="tk-soft-tile">
                  <strong>No items yet</strong>
                  <p>Add your first inventory item using the button above.</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="tk-side-stack">
            {lowStock.length > 0 ? (
              <div className="tk-card" id="low-stock">
                <div className="tk-card-head">
                  <div className="tk-card-head__copy">
                    <p className="tk-eyebrow">Action needed</p>
                    <h2 className="tk-card-title">Low stock</h2>
                  </div>
                </div>
                <div className="tk-mini-stack">
                  {lowStock.map((item) => (
                    <div className="tk-soft-tile" key={item.id}>
                      <strong>{item.name}</strong>
                      <p>
                        {item.inStock} left — min {item.minLevel} — {item.location}
                      </p>
                    </div>
                  ))}
                  <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`}>
                    Raise restock request
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="tk-card" id="store-actions">
              <div className="tk-card-head">
                <div className="tk-card-head__copy">
                  <p className="tk-eyebrow">Store operations</p>
                  <h2 className="tk-card-title">Quick actions</h2>
                </div>
              </div>
              <div className="tk-mini-stack">
                <button className="tk-soft-tile tk-soft-tile--link" onClick={openAdd} type="button" style={{ textAlign: "left", cursor: "pointer" }}>
                  <strong>Add an item</strong>
                  <p>Register a new stock item with quantity and minimum level.</p>
                </button>
                <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${snapshot.workspace.slug}/chat`}>
                  <strong>Receive stock</strong>
                  <p>Log incoming items and update quantities via chat.</p>
                </Link>
                <Link className="tk-soft-tile tk-soft-tile--link" href={`/w/${snapshot.workspace.slug}/chat`}>
                  <strong>Approve item release</strong>
                  <p>Authorize stock release with a traceable record.</p>
                </Link>
                <Link className="tk-soft-tile tk-soft-tile--link" href={`${base}/requests`}>
                  <strong>Open supply requests</strong>
                  <p>View and action all pending stock approval workflows.</p>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div className="tk-modal-backdrop" onClick={closeModal}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            {modalMode === "add" ? (
              <>
                <div className="tk-modal__head">
                  <div>
                    <div className="tk-modal__title">Add inventory item</div>
                    <div className="tk-modal__subtitle">New item will appear in the register immediately</div>
                  </div>
                  <button className="tk-modal__close" onClick={closeModal} type="button" aria-label="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
                <div className="tk-modal__body">
                  <div className="tk-modal__form-field">
                    <label htmlFor="inv-name">Item name</label>
                    <input
                      id="inv-name"
                      placeholder="e.g. A4 bond paper"
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="tk-modal__form-field">
                    <label htmlFor="inv-loc">Location</label>
                    <input
                      id="inv-loc"
                      placeholder="e.g. Main store"
                      type="text"
                      value={form.location}
                      onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                  <div className="tk-modal__form-row">
                    <div className="tk-modal__form-field">
                      <label htmlFor="inv-qty">In stock (qty)</label>
                      <input
                        id="inv-qty"
                        min="0"
                        placeholder="0"
                        type="number"
                        value={form.inStock}
                        onChange={(e) => setForm((f) => ({ ...f, inStock: e.target.value }))}
                      />
                    </div>
                    <div className="tk-modal__form-field">
                      <label htmlFor="inv-min">Min level</label>
                      <input
                        id="inv-min"
                        min="0"
                        placeholder="0"
                        type="number"
                        value={form.minLevel}
                        onChange={(e) => setForm((f) => ({ ...f, minLevel: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="tk-modal__actions">
                  <button className="button button--primary" disabled={!form.name.trim()} onClick={handleAdd} type="button">
                    Add item
                  </button>
                  <button className="button button--ghost" onClick={closeModal} type="button">
                    Cancel
                  </button>
                </div>
              </>
            ) : selectedItem ? (
              <>
                <div className="tk-modal__head">
                  <div>
                    <div className="tk-modal__title">{selectedItem.name}</div>
                    <div className="tk-modal__subtitle">{selectedItem.location}</div>
                  </div>
                  <button className="tk-modal__close" onClick={closeModal} type="button" aria-label="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
                <div className="tk-modal__body">
                  <div className="tk-inv-bar" style={{ height: "6px" }}>
                    <div className="tk-inv-bar__fill" style={{ width: `${stockPercent(selectedItem)}%`, background: stockColor(selectedItem) }} />
                  </div>
                  <div className="tk-modal__stat-row">
                    <div className="tk-modal__stat">
                      <span>In stock</span>
                      <strong>{selectedItem.inStock}</strong>
                    </div>
                    <div className="tk-modal__stat">
                      <span>Available</span>
                      <strong>{Math.max(selectedItem.inStock - selectedItem.reserved, 0)}</strong>
                    </div>
                    <div className="tk-modal__stat">
                      <span>Reserved</span>
                      <strong>{selectedItem.reserved}</strong>
                    </div>
                    <div className="tk-modal__stat">
                      <span>Min level</span>
                      <strong>{selectedItem.minLevel}</strong>
                    </div>
                    <div className="tk-modal__stat">
                      <span>Location</span>
                      <strong>{selectedItem.location}</strong>
                    </div>
                    <div className="tk-modal__stat">
                      <span>Status</span>
                      <strong style={{ color: selectedItem.inStock <= selectedItem.minLevel ? "#c0432a" : "#267a4f" }}>
                        {selectedItem.inStock <= selectedItem.minLevel ? "Reorder" : "Healthy"}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="tk-modal__actions">
                  <Link className="button button--primary" href={`/w/${snapshot.workspace.slug}/chat`} onClick={closeModal}>
                    Raise restock request
                  </Link>
                  <Link className="button button--ghost" href={`/w/${snapshot.workspace.slug}/chat`} onClick={closeModal}>
                    Log release
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

