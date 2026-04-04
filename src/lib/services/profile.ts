"use client";

import type { WalletTransaction } from "@/lib/types";

export type { WalletTransaction };

export type UserProfile = {
  fullName: string;
  initials: string;
  age?: number;
  currency?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;       // e.g. "Executive Director"
  organization?: string;   // e.g. "Harbour Church"
  city?: string;
  signatureName?: string;  // What appears at the bottom of letters/memos
  bio?: string;            // Free-form context for the AI (personality, preferences, anything)
};

const ACTIVE_PROFILE_KEY = "chertt:active-profile";
const PROFILES_BY_EMAIL_KEY = "chertt:profiles-by-email";
const LEGACY_SIGNUP_PROFILE_KEY = "chertt:signup-profile";
const WALLET_KEY = "chertt:wallet";
const DEMO_STARTING_BALANCE = 500_000;

function canUseStorage() {
  return typeof window !== "undefined";
}

function normalizeName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCurrency(value?: string) {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed.slice(0, 3) : undefined;
}

export function deriveNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "User";
  const words = local
    .replace(/[_\-.]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (!words.length) {
    return "User";
  }

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function buildInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "U";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function buildUserProfile(input: {
  fullName?: string;
  age?: number;
  email?: string;
}): UserProfile {
  const fallbackName = input.email ? deriveNameFromEmail(input.email) : "User";
  const fullName = normalizeName(input.fullName || fallbackName);

  return {
    fullName,
    initials: buildInitials(fullName),
    age: Number.isFinite(input.age) ? input.age : undefined,
    currency: undefined,
    email: input.email?.toLowerCase(),
  };
}

export function setActiveUserProfile(profile: UserProfile) {
  if (!canUseStorage()) {
    return;
  }

  const fullName = normalizeName(profile.fullName || "User");
  const normalizedProfile: UserProfile = {
    ...profile,
    fullName,
    initials: buildInitials(fullName),
    currency: normalizeCurrency(profile.currency),
    email: profile.email?.toLowerCase(),
  };

  window.localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(normalizedProfile));
  window.dispatchEvent(new Event("chertt-profile-updated"));
}

export function clearActiveUserProfile() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ACTIVE_PROFILE_KEY);
  window.dispatchEvent(new Event("chertt-profile-updated"));
}

export function getActiveUserProfile() {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as UserProfile;
      if (!parsed?.fullName) {
        return null;
      }

      return {
        ...parsed,
        fullName: normalizeName(parsed.fullName),
        initials: buildInitials(parsed.fullName),
        currency: normalizeCurrency(parsed.currency),
      };
    } catch {
      return null;
    }
  }

  // Backward compatibility with previous simple signup storage format.
  const legacy = window.localStorage.getItem(LEGACY_SIGNUP_PROFILE_KEY);
  if (!legacy) {
    return null;
  }

  try {
    const parsed = JSON.parse(legacy) as { fullName?: string; age?: number };
    if (!parsed?.fullName) {
      return null;
    }

    const profile = buildUserProfile({
      fullName: parsed.fullName,
      age: parsed.age,
    });
    setActiveUserProfile(profile);
    window.localStorage.removeItem(LEGACY_SIGNUP_PROFILE_KEY);
    return profile;
  } catch {
    return null;
  }
}

export function rememberUserProfileForEmail(email: string, profile: UserProfile) {
  if (!canUseStorage()) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const existing = getProfilesByEmail();
  existing[normalizedEmail] = profile;
  window.localStorage.setItem(PROFILES_BY_EMAIL_KEY, JSON.stringify(existing));
}

export function getRememberedUserProfileForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !canUseStorage()) {
    return null;
  }

  const map = getProfilesByEmail();
  const profile = map[normalizedEmail];
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    fullName: normalizeName(profile.fullName),
    initials: buildInitials(profile.fullName),
    currency: normalizeCurrency(profile.currency),
  };
}

function getProfilesByEmail(): Record<string, UserProfile> {
  if (!canUseStorage()) {
    return {};
  }

  const raw = window.localStorage.getItem(PROFILES_BY_EMAIL_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, UserProfile>;
  } catch {
    return {};
  }
}

// ---- Wallet helpers ----

type WalletState = { balance: number; transactions: WalletTransaction[] };

function readWallet(): WalletState {
  if (!canUseStorage()) return { balance: DEMO_STARTING_BALANCE, transactions: [] };
  const raw = window.localStorage.getItem(WALLET_KEY);
  if (!raw) return { balance: DEMO_STARTING_BALANCE, transactions: [] };
  try {
    return JSON.parse(raw) as WalletState;
  } catch {
    return { balance: DEMO_STARTING_BALANCE, transactions: [] };
  }
}

function saveWallet(state: WalletState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(WALLET_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("chertt-wallet-updated"));
}

export function getWallet(): WalletState {
  return readWallet();
}

export function deductFromWallet(amount: number, label: string): boolean {
  const state = readWallet();
  if (state.balance < amount) return false;
  const tx: WalletTransaction = {
    id: `tx-${Date.now()}`,
    label,
    amount,
    type: "debit",
    createdAt: Date.now(),
  };
  saveWallet({ balance: state.balance - amount, transactions: [tx, ...state.transactions] });
  return true;
}

export function creditWallet(amount: number, label: string) {
  const state = readWallet();
  const tx: WalletTransaction = {
    id: `tx-${Date.now()}`,
    label,
    amount,
    type: "credit",
    createdAt: Date.now(),
  };
  saveWallet({ balance: state.balance + amount, transactions: [tx, ...state.transactions] });
}

export function resetWalletToDemo() {
  saveWallet({ balance: DEMO_STARTING_BALANCE, transactions: [] });
}
