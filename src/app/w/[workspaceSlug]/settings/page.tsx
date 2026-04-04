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
    setSaved(true);
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

  const activeCurrency = profile.currency || snapshot.workspace.currency;
  const displayName = profile.fullName?.trim() || snapshot.membership.userName;
  const displayRole = profile.jobTitle?.trim() || snapshot.membership.title;
  const displayOrg = profile.organization?.trim() || snapshot.workspace.name;
  const displaySignature = profile.signatureName?.trim() || displayName;
  const firstName = displayName.split(/\s+/)[0] || "You";
  const filledCount = [
    profile.fullName,
    profile.signatureName,
    profile.jobTitle,
    profile.organization,
    profile.email,
    profile.phone,
    profile.city,
    profile.bio,
  ].filter((value) => Boolean(value?.trim())).length;
  const readiness = Math.round((filledCount / 8) * 100);

  return (
    <div className={styles.page}>
      <section className={styles.intro}>
        <div className={styles.introText}>
          <p className={styles.kicker}>Settings</p>
          <h1>Make Chertt sound like you.</h1>
          <p className={styles.introBody}>
            This is not just profile data. It is the voice, signature, contact layer, and money default that shape every response Chertt gives you.
          </p>
        </div>

        <div className={styles.identityPanel}>
          <div className={styles.identityTop}>
            <div className={styles.avatar}>{profile.initials || buildInitials(displayName) || snapshot.membership.avatarInitials}</div>
            <div className={styles.identityMeta}>
              <strong>{displayName}</strong>
              <span>{displayRole}</span>
              <p>{displayOrg}</p>
            </div>
          </div>

          <div className={styles.identityStrip}>
            <span>{activeCurrency}</span>
            <span>{readiness}% ready</span>
            <span>{saved ? "Saved" : "Autosaving"}</span>
          </div>
        </div>
      </section>

      <section className={styles.studio}>
        <div className={styles.canvas}>
          <div className={styles.block}>
            <div className={styles.blockHead}>
              <div>
                <p className={styles.eyebrow}>Core identity</p>
                <h2>The name and role Chertt should carry</h2>
              </div>
            </div>

            <div className={styles.fieldStack}>
              {FIELD_CONFIG.slice(0, 4).map((field) => (
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
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <div>
                <p className={styles.eyebrow}>Contact layer</p>
                <h2>Where people can reach you</h2>
              </div>
            </div>

            <div className={styles.fieldStack}>
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
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <div>
                <p className={styles.eyebrow}>Working context</p>
                <h2>The extra context that makes the AI smarter</h2>
              </div>
            </div>

            <label className={styles.field} htmlFor="field-bio">
              <span className={styles.fieldLabel}>Working context</span>
              <textarea
                className={styles.textarea}
                id="field-bio"
                onChange={(event) => update("bio", event.target.value)}
                placeholder="Example: I handle operations, vendor follow-up, internal approvals, and formal communication. Keep my tone warm, direct, and professional."
                rows={7}
                value={profile.bio ?? ""}
              />
              <small className={styles.helper}>{FIELD_CONFIG[7].helper}</small>
            </label>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={`${styles.panel} ${styles.previewPanel}`}>
            <div className={styles.panelHead}>
              <p className={styles.eyebrowAlt}>Live preview</p>
              <span className={styles.miniTag}>Voice sample</span>
            </div>

            <div className={styles.previewLetter}>
              <span>Hi {firstName},</span>
              <p>
                I have prepared this draft under <strong>{displaySignature}</strong>, {displayRole.toLowerCase()} at <strong>{displayOrg}</strong>.
              </p>
              <p>
                Any money request or invoice I prepare for you will default to <strong>{activeCurrency}</strong>.
              </p>
              <div className={styles.previewClose}>
                <span>Warm regards,</span>
                <strong>{displaySignature}</strong>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Money default</p>
                <h3>Choose your currency</h3>
              </div>
            </div>

            <label className={styles.field} htmlFor="field-currency">
              <span className={styles.fieldLabel}>Currency</span>
              <select
                className={styles.select}
                id="field-currency"
                onChange={(event) => update("currency", event.target.value)}
                value={activeCurrency}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              <small className={styles.helper}>This becomes the default for balances, expenses, requests, invoices, and payment flows.</small>
            </label>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Demo wallet</p>
                <h3>{formatCurrency(balance, activeCurrency)}</h3>
              </div>
            </div>

            <div className={styles.actionRow}>
              <button className={styles.softButton} onClick={() => creditWallet(100_000, "Demo top-up")} type="button">
                Top up
              </button>
              <button className={styles.softButton} onClick={() => resetWalletToDemo()} type="button">
                Reset
              </button>
            </div>

            {transactions.length > 0 ? (
              <div className={styles.transactionStack}>
                {transactions.slice(0, 8).map((tx) => (
                  <div className={styles.transaction} key={tx.id}>
                    <div className={styles.transactionCopy}>
                      <span className={`${styles.dot} ${tx.type === "credit" ? styles.dotCredit : styles.dotDebit}`} />
                      <div>
                        <strong>{tx.label}</strong>
                        <p>{tx.type === "debit" ? "Debit" : "Credit"}</p>
                      </div>
                    </div>
                    <span className={`${styles.amount} ${tx.type === "credit" ? styles.amountCredit : styles.amountDebit}`}>
                      {tx.type === "debit" ? "-" : "+"}{formatCurrency(tx.amount, activeCurrency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyBox}>
                <strong>No wallet activity yet</strong>
                <p>Once you test giving or payment actions, the movement will appear here.</p>
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Session</p>
                <h3>Quick actions</h3>
              </div>
            </div>

            <div className={styles.actionColumn}>
              <Link className={styles.primaryLink} href={`/w/${snapshot.workspace.slug}/chat`}>
                Back to chat
              </Link>
              <button className={styles.ghostButton} onClick={() => void handleLogout()} type="button">
                {loggingOut ? "Signing out..." : "Log out"}
              </button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
