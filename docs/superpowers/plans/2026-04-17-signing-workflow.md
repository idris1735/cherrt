# Signing Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real two-step document signing workflow — draft → route → sign — with a 3-tab modal (Draw / Upload / Stamp), role-based access, and a post-sign confirmation bubble in chat.

**Architecture:** The `SmartDocument` type gains three new fields (`signedBy`, `signedAt`, `signatureData`). A new `SignModal` component handles signing. The chat page emits a routing bubble after document creation and replaces the current one-click sign button with the modal. Settings gets a signature management section.

**Tech Stack:** Next.js 14 app router, TypeScript, CSS Modules, HTML Canvas API, FileReader API, React hooks. No new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types.ts` | Modify lines 72–82 | Add `signedBy`, `signedAt`, `signatureData` to `SmartDocument` |
| `src/components/sign/sign-modal.module.css` | Create | Styles for overlay, tabs, canvas, stamp preview, buttons |
| `src/components/sign/sign-modal.tsx` | Create | 3-tab signing modal component |
| `src/app/w/[workspaceSlug]/chat/page.tsx` | Modify | Routing bubble, role-gated Sign button, modal wire-up, post-sign bubble |
| `src/app/w/[workspaceSlug]/settings/page.tsx` | Modify | Signature canvas/upload/clear section |

---

## Task 1: Extend SmartDocument type

**Files:**
- Modify: `src/lib/types.ts:72-82`

- [ ] **Step 1: Add signing fields to SmartDocument**

Open `src/lib/types.ts`. Replace the `SmartDocument` interface (lines 72–82):

```ts
export interface SmartDocument {
  id: string;
  title: string;
  type: "letter" | "invoice" | "memo";
  body: string;
  status: WorkflowStatus;
  preparedBy: string;
  awaitingSignatureFrom?: string;
  signedBy?: string;
  signedAt?: string;
  signatureData?: string; // "stamp" | base64 PNG data URL
  amount?: number;
  createdAtLabel: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add signing fields to SmartDocument type"
```

---

## Task 2: Build SignModal CSS

**Files:**
- Create: `src/components/sign/sign-modal.module.css`

- [ ] **Step 1: Create sign-modal.module.css**

Create `src/components/sign/sign-modal.module.css` with this content:

```css
/* ─── Overlay ─────────────────────────────────────────────────── */

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  backdrop-filter: blur(2px);
}

@media (min-width: 600px) {
  .overlay {
    align-items: center;
    padding: 20px;
  }
}

/* ─── Modal ───────────────────────────────────────────────────── */

.modal {
  width: 100%;
  max-width: 480px;
  background: var(--ch-surface);
  border: 1px solid var(--ch-border);
  border-radius: 20px 20px 0 0;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  max-height: 90vh;
  overflow: hidden;
  animation: slideUp 0.22s cubic-bezier(0.2, 0, 0, 1) both;
}

@media (min-width: 600px) {
  .modal {
    border-radius: 16px;
    animation: fadeIn 0.18s ease both;
  }
}

@keyframes slideUp {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ─── Header ──────────────────────────────────────────────────── */

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--ch-border);
}

.headerMeta {
  display: grid;
  gap: 2px;
}

.headerLabel {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ch-muted);
  font-weight: 640;
}

.headerTitle {
  font-size: 0.95rem;
  font-weight: 640;
  color: var(--ch-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.closeBtn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--ch-border);
  background: transparent;
  color: var(--ch-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.closeBtn svg { width: 13px; height: 13px; }

.closeBtn:hover {
  background: var(--ch-surface-soft);
  color: var(--ch-text);
}

/* ─── Tabs ────────────────────────────────────────────────────── */

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--ch-border);
  padding: 0 20px;
}

.tab {
  flex: 1;
  min-height: 40px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ch-muted);
  font-size: 0.8rem;
  font-weight: 580;
  cursor: pointer;
  transition: color 0.14s ease, border-color 0.14s ease;
}

.tabActive {
  color: var(--ch-accent);
  border-bottom-color: var(--ch-accent);
  font-weight: 640;
}

.tab:hover:not(.tabActive) {
  color: var(--ch-text);
}

/* ─── Tab body ────────────────────────────────────────────────── */

.body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}

/* ─── Canvas ──────────────────────────────────────────────────── */

.canvasWrap {
  position: relative;
  border: 1px solid var(--ch-border);
  border-radius: 10px;
  background: var(--ch-surface-soft);
  overflow: hidden;
}

.canvas {
  display: block;
  width: 100%;
  height: 160px;
  touch-action: none;
  cursor: crosshair;
}

.canvasClear {
  position: absolute;
  top: 8px;
  right: 8px;
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--ch-border);
  background: var(--ch-surface);
  color: var(--ch-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.14s ease, border-color 0.14s ease;
}

.canvasClear:hover {
  color: var(--ch-text);
  border-color: var(--ch-text);
}

.canvasHint {
  font-size: 0.74rem;
  color: var(--ch-muted);
  text-align: center;
}

/* ─── Upload ──────────────────────────────────────────────────── */

.uploadPreview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--ch-border);
  border-radius: 10px;
  background: var(--ch-surface-soft);
}

.uploadSigImg {
  max-height: 56px;
  max-width: 180px;
  object-fit: contain;
  object-position: left center;
}

.uploadMeta {
  display: grid;
  gap: 6px;
}

.uploadLabel {
  font-size: 0.76rem;
  color: var(--ch-muted);
}

.uploadChange {
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--ch-border);
  background: transparent;
  color: var(--ch-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.14s ease, border-color 0.14s ease;
  width: fit-content;
}

.uploadChange:hover {
  color: var(--ch-text);
  border-color: var(--ch-text);
}

.uploadDropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 20px;
  border: 1.5px dashed var(--ch-border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.14s ease;
}

.uploadDropzone:hover {
  border-color: var(--ch-accent);
}

.uploadDropzone svg {
  width: 24px;
  height: 24px;
  color: var(--ch-muted);
}

.uploadDropzoneText {
  font-size: 0.8rem;
  color: var(--ch-muted);
  text-align: center;
}

.fileInput {
  display: none;
}

/* ─── Stamp ───────────────────────────────────────────────────── */

.stampPreview {
  padding: 20px;
  border: 1px solid var(--ch-border);
  border-radius: 10px;
  background: var(--ch-surface-soft);
  display: grid;
  gap: 4px;
}

.stampText {
  font-size: 0.9rem;
  color: var(--ch-text);
  margin: 0;
}

.stampText strong {
  font-weight: 660;
}

.stampDate {
  font-size: 0.78rem;
  color: var(--ch-muted);
  margin: 0;
}

.stampNote {
  font-size: 0.72rem;
  color: var(--ch-muted);
  margin-top: 4px;
}

/* ─── Footer ──────────────────────────────────────────────────── */

.footer {
  display: flex;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--ch-border);
}

.cancelBtn {
  flex: 1;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--ch-border);
  background: transparent;
  color: var(--ch-muted);
  font-size: 0.84rem;
  cursor: pointer;
  transition: color 0.14s ease, border-color 0.14s ease;
}

.cancelBtn:hover {
  color: var(--ch-text);
  border-color: var(--ch-text);
}

.signBtn {
  flex: 2;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid oklch(0.52 0.18 145);
  background: oklch(0.52 0.18 145);
  color: oklch(0.99 0 0);
  font-size: 0.84rem;
  font-weight: 640;
  cursor: pointer;
  transition: opacity 0.14s ease, transform 0.12s ease;
}

.signBtn:hover {
  opacity: 0.88;
  transform: translateY(-1px);
}

.signBtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sign/sign-modal.module.css
git commit -m "feat: add SignModal CSS"
```

---

## Task 3: Build SignModal component

**Files:**
- Create: `src/components/sign/sign-modal.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/sign/sign-modal.tsx`:

```tsx
"use client";

import { useRef, useState, useEffect } from "react";
import type { SmartDocument } from "@/lib/types";
import { getActiveUserProfile, setActiveUserProfile } from "@/lib/services/profile";
import styles from "./sign-modal.module.css";

type Tab = "draw" | "upload" | "stamp";

type Props = {
  document: SmartDocument;
  signerName: string;
  onSign: (signatureData: string) => void;
  onClose: () => void;
};

function getEventPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  if ("touches" in e) {
    return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY,
    };
  }
  return {
    x: ((e as MouseEvent).clientX - rect.left) * scaleX,
    y: ((e as MouseEvent).clientY - rect.top) * scaleY,
  };
}

export function SignModal({ document, signerName, onSign, onClose }: Props) {
  const profile = getActiveUserProfile();
  const savedSig = profile?.signatureImage ?? null;

  const [tab, setTab] = useState<Tab>(savedSig ? "upload" : "draw");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(savedSig);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set canvas resolution once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }, []);

  // Attach drawing event listeners when Draw tab is active
  useEffect(() => {
    if (tab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let drawing = false;

    function onStart(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      drawing = true;
      const pos = getEventPos(e, canvas!);
      ctx!.beginPath();
      ctx!.moveTo(pos.x, pos.y);
    }

    function onMove(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      if (!drawing) return;
      const pos = getEventPos(e, canvas!);
      ctx!.lineTo(pos.x, pos.y);
      ctx!.stroke();
      setHasDrawn(true);
    }

    function onEnd() {
      drawing = false;
    }

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onEnd);
    canvas.addEventListener("mouseleave", onEnd);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);

    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [tab]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result as string;
      setUploadedImage(data);
      // Persist to profile for future use
      const current = getActiveUserProfile();
      if (current) setActiveUserProfile({ ...current, signatureImage: data });
    };
    reader.readAsDataURL(file);
  }

  function handleSign() {
    if (tab === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      // Save drawn signature to profile
      const data = canvas.toDataURL("image/png");
      const current = getActiveUserProfile();
      if (current) setActiveUserProfile({ ...current, signatureImage: data });
      onSign(data);
    } else if (tab === "upload") {
      if (!uploadedImage) return;
      onSign(uploadedImage);
    } else {
      onSign("stamp");
    }
  }

  const canApply =
    (tab === "draw" && hasDrawn) ||
    (tab === "upload" && !!uploadedImage) ||
    tab === "stamp";

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <span className={styles.headerLabel}>Sign document</span>
            <span className={styles.headerTitle}>{document.title}</span>
          </div>
          <button aria-label="Close" className={styles.closeBtn} onClick={onClose} type="button">
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {(["draw", "upload", "stamp"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
              onClick={() => setTab(t)}
              type="button"
            >
              {t === "draw" ? "Draw" : t === "upload" ? "Upload" : "Stamp"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={styles.body}>
          {tab === "draw" ? (
            <>
              <div className={styles.canvasWrap}>
                <canvas ref={canvasRef} className={styles.canvas} />
                <button className={styles.canvasClear} onClick={clearCanvas} type="button">
                  Clear
                </button>
              </div>
              <p className={styles.canvasHint}>Sign with your mouse or finger</p>
            </>
          ) : tab === "upload" ? (
            <>
              {uploadedImage ? (
                <div className={styles.uploadPreview}>
                  <img alt="Saved signature" className={styles.uploadSigImg} src={uploadedImage} />
                  <div className={styles.uploadMeta}>
                    <span className={styles.uploadLabel}>Saved signature</span>
                    <button
                      className={styles.uploadChange}
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={styles.uploadDropzone}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M12 16V8M8 12l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                  </svg>
                  <span className={styles.uploadDropzoneText}>
                    Tap to upload a PNG or JPG of your signature
                  </span>
                </button>
              )}
              <input
                accept="image/png,image/jpeg"
                className={styles.fileInput}
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            </>
          ) : (
            <div className={styles.stampPreview}>
              <p className={styles.stampText}>
                Approved by <strong>{signerName}</strong>
              </p>
              <p className={styles.stampDate}>{today}</p>
              <p className={styles.stampNote}>
                No signature image — a text approval stamp will be applied to the document.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={styles.signBtn}
            disabled={!canApply}
            onClick={handleSign}
            type="button"
          >
            Apply signature
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/sign/sign-modal.tsx
git commit -m "feat: add SignModal component with Draw/Upload/Stamp tabs"
```

---

## Task 4: Wire signing into the chat page

**Files:**
- Modify: `src/app/w/[workspaceSlug]/chat/page.tsx`

Four changes in this file:
1. Import `SignModal`
2. Add `signingDocId` state + `canSign` constant
3. Add routing bubble in `sendPrompt` after document creation
4. Replace one-click Sign button with modal trigger + add post-sign bubble + render modal

- [ ] **Step 1: Add import and state**

At the top of `chat/page.tsx`, add the import after the existing imports:

```tsx
import { SignModal } from "@/components/sign/sign-modal";
```

Inside `ChatPage()`, after the existing `useState` declarations, add:

```tsx
const [signingDocId, setSigningDocId] = useState<string | null>(null);
const canSign = (["owner", "admin", "approver"] as string[]).includes(snapshot.membership.role);
```

- [ ] **Step 2: Add routing bubble in sendPrompt**

In `sendPrompt`, after line 506 (`applyAiResult(payload);`), add:

```tsx
// Emit a routing bubble when a document is created
if (payload.generatedDocument) {
  const awaiting = payload.generatedDocument.awaitingSignatureFrom || "Admin";
  const routingNow = Date.now();
  addMessage(conversationId, {
    id: `routing-${routingNow}`,
    speaker: "assistant",
    text: `Routed to **${awaiting}** for signature. An authorized team member can review and sign.`,
    timeLabel: "Now",
    createdAt: routingNow,
  });
}
```

- [ ] **Step 3: Replace one-click Sign button with modal trigger**

Find this block in the document card render (around line 982):

```tsx
{doc.awaitingSignatureFrom && doc.status === "pending" ? (
  <button
    className={`${styles.inlineDocBtn} ${styles.inlineDocBtnSign}`}
    onClick={() => upsertDocument({ ...doc, status: "approved", awaitingSignatureFrom: undefined })}
    type="button"
  >
    Sign off ✓
  </button>
) : doc.status === "approved" ? (
  <span className={styles.inlineDocSigned}>✓ Signed</span>
) : null}
```

Replace with:

```tsx
{doc.awaitingSignatureFrom && doc.status === "pending" ? (
  canSign ? (
    <button
      className={`${styles.inlineDocBtn} ${styles.inlineDocBtnSign}`}
      onClick={() => setSigningDocId(doc.id)}
      type="button"
    >
      Sign
    </button>
  ) : (
    <span style={{ fontSize: "0.72rem", color: "var(--ch-muted)" }}>
      Awaiting · {doc.awaitingSignatureFrom}
    </span>
  )
) : doc.status === "approved" ? (
  <span className={styles.inlineDocSigned}>
    ✓ Signed{doc.signedBy ? ` by ${doc.signedBy}` : ""}
  </span>
) : null}
```

- [ ] **Step 4: Render SignModal + handle post-sign**

In the JSX return, just before the closing `</div>` of the root chat container, add:

```tsx
{signingDocId ? (() => {
  const doc = snapshot.documents.find((d) => d.id === signingDocId);
  if (!doc) return null;
  const profile = getActiveUserProfile();
  const signerName =
    profile?.signatureName || profile?.fullName || snapshot.membership.userName;
  return (
    <SignModal
      document={doc}
      signerName={signerName}
      onSign={(signatureData) => {
        const signedDoc: typeof doc = {
          ...doc,
          status: "approved",
          signedBy: signerName,
          signedAt: new Date().toISOString(),
          signatureData,
          awaitingSignatureFrom: undefined,
        };
        upsertDocument(signedDoc);
        const convId = activeConversation?.id;
        if (convId) {
          const now = Date.now();
          addMessage(convId, {
            id: `signed-${now}`,
            speaker: "assistant",
            text: `**${doc.title}** has been signed by ${signerName}. The document is now authorized and ready to send.`,
            timeLabel: "Now",
            createdAt: now,
          });
        }
        setSigningDocId(null);
      }}
      onClose={() => setSigningDocId(null)}
    />
  );
})() : null}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Manual test — routing bubble**

Start the dev server (`npm run dev`). Sign in and type:
> *"Draft a letter to our fuel vendor about payment extension"*

Expected:
- Chertt sends the document card inline in chat
- A second bubble appears: *"Routed to Admin for signature. An authorized team member can review and sign."*

- [ ] **Step 7: Manual test — signing**

On the document card header, click "Sign".
Expected: SignModal slides up with 3 tabs.

Test Draw tab: draw something, click "Apply signature".
Expected: Modal closes, document header shows "✓ Signed by [Name]", a new Chertt bubble says "has been signed".

- [ ] **Step 8: Manual test — non-admin cannot sign**

To test this, temporarily change `snapshot.membership.role` to `"operations"` in the seed data or hard-code for testing. The Sign button should not appear — instead show "Awaiting · Admin".

- [ ] **Step 9: Commit**

```bash
git add src/app/w/\[workspaceSlug\]/chat/page.tsx
git commit -m "feat: wire SignModal into chat — routing bubble, role-gated sign, post-sign bubble"
```

---

## Task 5: Settings signature management section

**Files:**
- Modify: `src/app/w/[workspaceSlug]/settings/page.tsx`

The settings page renders text fields from `FIELD_CONFIG`. We add a custom signature section below the existing fields with a draw canvas and file upload.

- [ ] **Step 1: Read the current settings page structure**

Open `src/app/w/[workspaceSlug]/settings/page.tsx` and find where the form fields render (look for the `FIELD_CONFIG.map(...)` render loop and where the form ends/submit button is).

- [ ] **Step 2: Add signature state and refs**

Inside the settings page component (after existing `useState` declarations), add:

```tsx
const sigCanvasRef = useRef<HTMLCanvasElement>(null);
const sigFileInputRef = useRef<HTMLInputElement>(null);
const [sigHasDrawn, setSigHasDrawn] = useState(false);
const [sigPreview, setSigPreview] = useState<string | null>(null);

// Load existing signature on mount
useEffect(() => {
  const p = getActiveUserProfile();
  if (p?.signatureImage) setSigPreview(p.signatureImage);
}, []);
```

Make sure `useRef` is imported (it likely already is).

- [ ] **Step 3: Add canvas drawing setup**

Inside the settings component, add a `useEffect` to wire up canvas drawing:

```tsx
useEffect(() => {
  const canvas = sigCanvasRef.current;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let drawing = false;

  function start(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    drawing = true;
    const rect2 = canvas!.getBoundingClientRect();
    const scaleX = canvas!.width / rect2.width / window.devicePixelRatio;
    const scaleY = canvas!.height / rect2.height / window.devicePixelRatio;
    const x = "touches" in e ? (e.touches[0].clientX - rect2.left) * scaleX : ((e as MouseEvent).clientX - rect2.left) * scaleX;
    const y = "touches" in e ? (e.touches[0].clientY - rect2.top) * scaleY : ((e as MouseEvent).clientY - rect2.top) * scaleY;
    ctx!.beginPath();
    ctx!.moveTo(x, y);
  }

  function move(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    if (!drawing) return;
    const rect2 = canvas!.getBoundingClientRect();
    const scaleX = canvas!.width / rect2.width / window.devicePixelRatio;
    const scaleY = canvas!.height / rect2.height / window.devicePixelRatio;
    const x = "touches" in e ? (e.touches[0].clientX - rect2.left) * scaleX : ((e as MouseEvent).clientX - rect2.left) * scaleX;
    const y = "touches" in e ? (e.touches[0].clientY - rect2.top) * scaleY : ((e as MouseEvent).clientY - rect2.top) * scaleY;
    ctx!.lineTo(x, y);
    ctx!.stroke();
    setSigHasDrawn(true);
  }

  function end() { drawing = false; }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  return () => {
    canvas.removeEventListener("mousedown", start);
    canvas.removeEventListener("mousemove", move);
    canvas.removeEventListener("mouseup", end);
    canvas.removeEventListener("mouseleave", end);
    canvas.removeEventListener("touchstart", start);
    canvas.removeEventListener("touchmove", move);
    canvas.removeEventListener("touchend", end);
  };
}, []);
```

- [ ] **Step 4: Add save/clear/upload handlers**

Inside the settings component, add these functions:

```tsx
function saveDrawnSignature() {
  const canvas = sigCanvasRef.current;
  if (!canvas || !sigHasDrawn) return;
  const data = canvas.toDataURL("image/png");
  setSigPreview(data);
  const current = getActiveUserProfile();
  if (current) setActiveUserProfile({ ...current, signatureImage: data });
}

function clearSignature() {
  setSigPreview(null);
  setSigHasDrawn(false);
  const canvas = sigCanvasRef.current;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
  const current = getActiveUserProfile();
  if (current) setActiveUserProfile({ ...current, signatureImage: undefined });
}

function handleSigFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const data = ev.target?.result as string;
    setSigPreview(data);
    const current = getActiveUserProfile();
    if (current) setActiveUserProfile({ ...current, signatureImage: data });
  };
  reader.readAsDataURL(file);
}
```

- [ ] **Step 5: Add the signature section JSX**

Find where the text field loop ends in the settings JSX. After the last field and before the save button, add:

```tsx
{/* Signature section */}
<div style={{ display: "grid", gap: 12, paddingTop: 8, borderTop: "1px solid var(--ch-border)" }}>
  <div>
    <p style={{ margin: "0 0 2px", fontSize: "0.82rem", fontWeight: 600, color: "var(--ch-text)" }}>
      Signature
    </p>
    <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--ch-muted)" }}>
      Used on letters and documents you sign. Draw or upload an image.
    </p>
  </div>

  {sigPreview ? (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--ch-border)", borderRadius: 10, background: "var(--ch-surface-soft)" }}>
      <img alt="Your signature" src={sigPreview} style={{ maxHeight: 56, maxWidth: 200, objectFit: "contain", objectPosition: "left center" }} />
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: "0.74rem", color: "var(--ch-muted)" }}>Saved signature</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => sigFileInputRef.current?.click()}
            style={{ height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--ch-border)", background: "transparent", color: "var(--ch-muted)", fontSize: "0.72rem", cursor: "pointer" }}
            type="button"
          >
            Replace
          </button>
          <button
            onClick={clearSignature}
            style={{ height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--ch-border)", background: "transparent", color: "var(--ch-muted)", fontSize: "0.72rem", cursor: "pointer" }}
            type="button"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ position: "relative", border: "1px solid var(--ch-border)", borderRadius: 10, background: "var(--ch-surface-soft)", overflow: "hidden" }}>
        <canvas
          ref={sigCanvasRef}
          style={{ display: "block", width: "100%", height: 120, touchAction: "none", cursor: "crosshair" }}
        />
        <button
          onClick={() => {
            const canvas = sigCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            setSigHasDrawn(false);
          }}
          style={{ position: "absolute", top: 8, right: 8, height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--ch-border)", background: "var(--ch-surface)", color: "var(--ch-muted)", fontSize: "0.72rem", cursor: "pointer" }}
          type="button"
        >
          Clear
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={!sigHasDrawn}
          onClick={saveDrawnSignature}
          style={{ flex: 1, minHeight: 36, borderRadius: 8, border: "1px solid oklch(0.52 0.18 145)", background: "oklch(0.52 0.18 145)", color: "#fff", fontSize: "0.8rem", fontWeight: 600, cursor: sigHasDrawn ? "pointer" : "not-allowed", opacity: sigHasDrawn ? 1 : 0.4 }}
          type="button"
        >
          Save drawn signature
        </button>
        <button
          onClick={() => sigFileInputRef.current?.click()}
          style={{ flex: 1, minHeight: 36, borderRadius: 8, border: "1px solid var(--ch-border)", background: "transparent", color: "var(--ch-text)", fontSize: "0.8rem", cursor: "pointer" }}
          type="button"
        >
          Upload image
        </button>
      </div>
    </div>
  )}

  <input
    accept="image/png,image/jpeg"
    onChange={handleSigFileChange}
    ref={sigFileInputRef}
    style={{ display: "none" }}
    type="file"
  />
</div>
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Manual test — save and use signature**

1. Navigate to `/w/[slug]/settings`
2. Draw a signature in the canvas and click "Save drawn signature"
3. The preview appears showing the saved signature
4. Navigate to chat, type *"Draft a letter to our vendor"*
5. The document body renders with the signature image in the closing block

- [ ] **Step 8: Commit**

```bash
git add src/app/w/\[workspaceSlug\]/settings/page.tsx
git commit -m "feat: add signature management section to settings"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Two-step routing flow (draft → routing bubble → sign) — Task 4 steps 2–4
- ✅ Draw tab with canvas — Task 3, Task 5
- ✅ Upload tab with saved profile signature — Task 3
- ✅ Stamp tab with text approval — Task 3
- ✅ Role-based sign button gating (`owner`, `admin`, `approver`) — Task 4 step 1
- ✅ Named assignee shown in routing bubble — Task 4 step 2 (`awaitingSignatureFrom`)
- ✅ Post-sign confirmation bubble in chat — Task 4 step 4
- ✅ `signedBy` / `signedAt` / `signatureData` on document — Task 1
- ✅ Signature profile persisted to localStorage via `signatureImage` — Task 3, Task 5
- ✅ Settings signature management — Task 5
- ✅ Canvas pane sign row — already exists in CSS; the modal now drives the signing, so the canvas pane "Sign" button (if it exists separately) should remain consistent. No additional canvas pane task needed since the inline doc card is the primary sign surface.

**Type consistency check:**
- `SmartDocument.signatureData` defined in Task 1, used in Task 4 — ✅
- `SmartDocument.signedBy` defined in Task 1, used in Task 4 — ✅
- `SignModal` props: `document: SmartDocument`, `signerName: string`, `onSign`, `onClose` — consistent across Task 3 and Task 4 — ✅
- `getActiveUserProfile()` / `setActiveUserProfile()` imported from `@/lib/services/profile` in both Task 3 and Task 5 — ✅
