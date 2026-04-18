"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { formatCurrency } from "@/lib/format";
import { clearLastWorkspaceSlug } from "@/lib/services/onboarding-draft";
import {
  clearActiveUserProfile,
  creditWallet,
  getActiveUserProfile,
  getWallet,
  rememberUserProfileForEmail,
  resetWalletToDemo,
  setActiveUserProfile,
  type UserProfile,
  type WalletTransaction,
} from "@/lib/services/profile";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import styles from "@/app/w/[workspaceSlug]/settings/page.module.css";

const CURRENCY_OPTIONS = ["NGN", "USD", "GBP", "EUR", "GHS", "KES"] as const;

const EMPTY: UserProfile = {
  fullName: "",
  initials: "",
  currency: "NGN",
  email: "",
  phone: "",
  jobTitle: "",
  organization: "",
  city: "",
  signatureName: "",
  bio: "",
};

function buildInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const FIELD_CONFIG: Array<{
  key: keyof UserProfile;
  label: string;
  helper: string;
  type?: "text" | "email" | "tel";
  multiline?: boolean;
}> = [
  {
    key: "fullName",
    label: "Full name",
    helper: "This is the name Chertt uses when it writes on your behalf.",
  },
  {
    key: "signatureName",
    label: "Signature name",
    helper: "Use the exact closing name you want at the end of letters and memos.",
  },
  {
    key: "jobTitle",
    label: "Role or title",
    helper: "Useful for formal letters, invoice headers, and request summaries.",
  },
  {
    key: "organization",
    label: "Organization",
    helper: "Your company, church, or institution name.",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    helper: "Used to match your account and fill formal contact blocks.",
  },
  {
    key: "phone",
    label: "Phone",
    type: "tel",
    helper: "Shown when Chertt creates staff cards or contact-ready drafts.",
  },
  {
    key: "city",
    label: "Location",
    helper: "Helpful for letters, scheduling, and context-aware drafting.",
  },
  {
    key: "bio",
    label: "Working context",
    multiline: true,
    helper: "Tell Chertt how you sound, what you handle, and what kind of work you usually do.",
  },
];

export default function SettingsPage() {
  const { snapshot } = useAppState();
  const router = useRouter();
  const { notify } = useToast();
  const [profile, setProfile] = useState<UserProfile>({ ...EMPTY, currency: snapshot.workspace.currency });
  const [saved, setSaved] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const [sigHasDrawn, setSigHasDrawn] = useState(false);

  useEffect(() => {
    const existing = getActiveUserProfile();
    setProfile({
      ...EMPTY,
      currency: existing?.currency ?? snapshot.workspace.currency,
      ...existing,
    });
  }, [snapshot.workspace.currency]);

  useEffect(() => {
    function syncWallet() {
      const wallet = getWallet();
      setBalance(wallet.balance);
      setTransactions(wallet.transactions);
    }

    syncWallet();
    window.addEventListener("chertt-wallet-updated", syncWallet);
    return () => window.removeEventListener("chertt-wallet-updated", syncWallet);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
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

    function getPos(e: MouseEvent | TouchEvent) {
      const r = canvas!.getBoundingClientRect();
      if ("touches" in e) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
      return { x: (e as MouseEvent).clientX - r.left, y: (e as MouseEvent).clientY - r.top };
    }

    function start(e: MouseEvent | TouchEvent) { e.preventDefault(); drawing = true; const p = getPos(e); ctx!.beginPath(); ctx!.moveTo(p.x, p.y); }
    function move(e: MouseEvent | TouchEvent) { e.preventDefault(); if (!drawing) return; const p = getPos(e); ctx!.lineTo(p.x, p.y); ctx!.stroke(); setSigHasDrawn(true); }
    function end() { drawing = false; }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    canvas.addEventListener("touchcancel", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
      canvas.removeEventListener("touchcancel", end);
    };
  // Re-run when image status flips so the canvas gets listeners after "Remove"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(profile.signatureImage)]);

  function persistProfile(nextProfile: UserProfile) {
    const normalized = {
      ...nextProfile,
      initials: buildInitials(nextProfile.fullName),
      currency: nextProfile.currency || snapshot.workspace.currency,
    };
    setActiveUserProfile(normalized);
    if (normalized.email) {
      rememberUserProfileForEmail(normalized.email, normalized);
    }
  }

  function update(key: keyof UserProfile, value: string) {
    setProfile((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "fullName") {
        next.initials = buildInitials(value);
      }
      return next;
    });

    setSaved(false);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      setProfile((latest) => {
        persistProfile(latest);
        return latest;
      });
      setSaved(true);
    }, 450);
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch {
      // Keep logout resilient even if Supabase is temporarily unavailable.
    } finally {
      clearActiveUserProfile();
      clearLastWorkspaceSlug();
      notify({
        tone: "success",
        title: "Signed out",
        description: "Your session has been closed.",
      });
      router.replace("/auth/sign-in");
      router.refresh();
    }
  }

  function saveDrawnSignature() {
    const canvas = sigCanvasRef.current;
    if (!canvas || !sigHasDrawn) return;
    const next = { ...profile, signatureImage: canvas.toDataURL("image/png") };
    setProfile(next);
    persistProfile(next);
    setSaved(true);
  }

  function clearSignature() {
    setSigHasDrawn(false);
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    const next = { ...profile, signatureImage: undefined };
    setProfile(next);
    persistProfile(next);
    setSaved(true);
  }

  function handleSigFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const next = { ...profile, signatureImage: ev.target?.result as string };
      setProfile(next);
      persistProfile(next);
      setSaved(true);
    };
    reader.readAsDataURL(file);
  }

  const activeCurrency = profile.currency || snapshot.workspace.currency;
  const displayName = profile.fullName?.trim() || snapshot.membership.userName;
  const displayRole = profile.jobTitle?.trim() || snapshot.membership.title;
  const displayOrg = profile.organization?.trim() || snapshot.workspace.name;
  const displaySignature = profile.signatureName?.trim() || displayName;

  return (
    <div className={styles.page}>
      {/* Mobile back */}
      <Link className={styles.backBtn} href={`/w/${snapshot.workspace.slug}/chat`}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3L5 8l5 5" />
        </svg>
        Back to chat
      </Link>

      {/* Page header */}
      <div className={styles.header}>
        <h1>Settings</h1>
        <span className={styles.saveStatus}>{saved ? "Saved" : "Saving…"}</span>
      </div>

      {/* Profile preview */}
      <div className={styles.profileRow}>
        <div className={styles.avatar}>
          {profile.initials || buildInitials(displayName) || snapshot.membership.avatarInitials}
        </div>
        <div className={styles.profileMeta}>
          <strong>{displayName}</strong>
          <span>{displayRole}{displayOrg ? ` · ${displayOrg}` : ""}</span>
        </div>
      </div>

      {/* Profile fields — fullName, jobTitle, organization (signatureName moved to Signature section) */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        {[FIELD_CONFIG[0], FIELD_CONFIG[2], FIELD_CONFIG[3]].map((field) => (
          <label className={styles.field} htmlFor={`field-${field.key}`} key={field.key}>
            <span className={styles.fieldLabel}>{field.label}</span>
            <input
              className={styles.input}
              id={`field-${field.key}`}
              onChange={(event) => update(field.key, event.target.value)}
              placeholder={field.label}
              type={field.type ?? "text"}
              value={(profile[field.key] as string) ?? ""}
            />
            <small className={styles.helper}>{field.helper}</small>
          </label>
        ))}
      </section>

      {/* Signature */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Signature</h2>

        {/* Preview */}
        <div className={styles.signaturePreview}>
          {profile.signatureImage ? (
            <img alt="Your signature" className={styles.signatureImage} src={profile.signatureImage} />
          ) : displaySignature ? (
            <span className={styles.signatureTextFallback}>{displaySignature}</span>
          ) : (
            <span className={styles.signatureEmpty}>No signature set yet</span>
          )}
        </div>

        {/* Signature name */}
        <label className={styles.field} htmlFor="field-signatureName">
          <span className={styles.fieldLabel}>Closing name</span>
          <input
            className={styles.input}
            id="field-signatureName"
            onChange={(event) => update("signatureName", event.target.value)}
            placeholder="e.g. Jordan Smith"
            type="text"
            value={profile.signatureName ?? ""}
          />
          <small className={styles.helper}>The name that appears at the bottom of letters and memos.</small>
        </label>

        {/* Signature canvas / upload */}
        <div style={{ display: "grid", gap: 12, paddingTop: 8, borderTop: "1px solid var(--ch-border)" }}>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: "0.82rem", fontWeight: 600, color: "var(--ch-text)" }}>
              Signature image
            </p>
            <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--ch-muted)" }}>
              Used on letters and documents you sign. Draw or upload an image.
            </p>
          </div>

          {profile.signatureImage ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--ch-border)", borderRadius: 10, background: "var(--ch-surface-soft)" }}>
              <img alt="Your signature" src={profile.signatureImage} style={{ maxHeight: 56, maxWidth: 200, objectFit: "contain", objectPosition: "left center" }} />
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
                  Clear canvas
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
      </section>

      {/* Contact fields */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contact</h2>
        {FIELD_CONFIG.slice(4, 7).map((field) => (
          <label className={styles.field} htmlFor={`field-${field.key}`} key={field.key}>
            <span className={styles.fieldLabel}>{field.label}</span>
            <input
              className={styles.input}
              id={`field-${field.key}`}
              onChange={(event) => update(field.key, event.target.value)}
              placeholder={field.label}
              type={field.type ?? "text"}
              value={(profile[field.key] as string) ?? ""}
            />
            <small className={styles.helper}>{field.helper}</small>
          </label>
        ))}
      </section>

      {/* AI context */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>AI context</h2>
        <label className={styles.field} htmlFor="field-bio">
          <span className={styles.fieldLabel}>Working context</span>
          <textarea
            className={styles.textarea}
            id="field-bio"
            onChange={(event) => update("bio", event.target.value)}
            placeholder="Example: I handle operations, vendor follow-up, internal approvals, and formal communication. Keep my tone warm, direct, and professional."
            rows={5}
            value={profile.bio ?? ""}
          />
          <small className={styles.helper}>{FIELD_CONFIG[7].helper}</small>
        </label>
      </section>

      {/* Preferences */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Preferences</h2>
        <label className={styles.field} htmlFor="field-currency">
          <span className={styles.fieldLabel}>Currency</span>
          <select
            className={styles.select}
            id="field-currency"
            onChange={(event) => update("currency", event.target.value)}
            value={activeCurrency}
          >
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
          <small className={styles.helper}>Default for expenses, requests, invoices, and payment flows.</small>
        </label>
      </section>

      {/* Demo wallet */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Demo wallet</h2>
          <span className={styles.sectionValue}>{formatCurrency(balance, activeCurrency)}</span>
        </div>
        <div className={styles.walletActions}>
          <button className={styles.softButton} onClick={() => creditWallet(100_000, "Demo top-up")} type="button">Top up</button>
          <button className={styles.softButton} onClick={() => resetWalletToDemo()} type="button">Reset</button>
        </div>
        {transactions.length > 0 ? (
          <div className={styles.transactionList}>
            {transactions.slice(0, 8).map((tx) => (
              <div className={styles.transaction} key={tx.id}>
                <div className={styles.transactionLeft}>
                  <span className={`${styles.dot} ${tx.type === "credit" ? styles.dotCredit : styles.dotDebit}`} />
                  <div className={styles.transactionInfo}>
                    <strong>{tx.label}</strong>
                    <span>{tx.type === "debit" ? "Debit" : "Credit"}</span>
                  </div>
                </div>
                <span className={`${styles.amount} ${tx.type === "credit" ? styles.amountCredit : styles.amountDebit}`}>
                  {tx.type === "debit" ? "−" : "+"}{formatCurrency(tx.amount, activeCurrency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyNote}>No wallet activity yet.</p>
        )}
      </section>

      {/* Session */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Session</h2>
        <div className={styles.sessionActions}>
          <Link className={styles.primaryLink} href={`/w/${snapshot.workspace.slug}/chat`}>Back to chat</Link>
          <button className={styles.ghostButton} onClick={() => void handleLogout()} type="button">
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}
