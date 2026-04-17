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
  const [tab, setTab] = useState<Tab>("draw");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydration-safe: read saved signature from localStorage after mount
  useEffect(() => {
    const p = getActiveUserProfile();
    const saved = p?.signatureImage ?? null;
    if (saved) {
      setUploadedImage(saved);
      setTab("upload");
    }
  }, []);

  // Size canvas and attach drawing event listeners when Draw tab is active
  useEffect(() => {
    if (tab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas correctly for devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    canvas.addEventListener("touchcancel", onEnd);

    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
      canvas.removeEventListener("touchcancel", onEnd);
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
