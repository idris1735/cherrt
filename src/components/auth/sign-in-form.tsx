"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { getLastWorkspaceSlug, getOnboardingDraft } from "@/lib/services/onboarding-draft";
import {
  buildUserProfile,
  deriveNameFromEmail,
  getActiveUserProfile,
  getRememberedUserProfileForEmail,
  rememberUserProfileForEmail,
  setActiveUserProfile,
} from "@/lib/services/profile";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { ModuleKey } from "@/lib/types";

const DEMO_ACCOUNT_EMAIL = "demo@chertt.app";
const DEMO_ACCOUNT_PASSWORD = "Demo@1234";
const DEMO_SESSION_KEY = "chertt:demo-session";
const LAST_WORKSPACE_KEY = "chertt:last-workspace-slug";

export function SignInForm({
  selectedModule = "toolkit",
  forcedMode,
  hideModeToggle = false,
}: {
  selectedModule?: ModuleKey;
  forcedMode?: "signin" | "signup";
  hideModeToggle?: boolean;
}) {
  const router = useRouter();
  const onboardingDraft = getOnboardingDraft();
  const lastWorkspaceSlug = getLastWorkspaceSlug();
  const [mode, setMode] = useState<"signin" | "signup">(forcedMode ?? "signin");
  const [email, setEmail] = useState(onboardingDraft?.fields.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const nextHref = useMemo(() => {
    const module = onboardingDraft?.selectedModule || selectedModule;
    if (onboardingDraft) {
      return `/auth/creating?module=${module}`;
    }

    if (lastWorkspaceSlug) {
      return `/w/${lastWorkspaceSlug}/chat`;
    }

    return "/w/global-hub/chat";
  }, [lastWorkspaceSlug, onboardingDraft, selectedModule]);

  useEffect(() => {
    if (forcedMode && forcedMode !== mode) {
      setMode(forcedMode);
    }
  }, [forcedMode, mode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (
      mode === "signin" &&
      normalizedEmail === DEMO_ACCOUNT_EMAIL &&
      password === DEMO_ACCOUNT_PASSWORD
    ) {
      const existing = getActiveUserProfile();
      const remembered = getRememberedUserProfileForEmail(normalizedEmail);
      const profile = remembered ?? existing ?? buildUserProfile({ fullName: "Demo User", email: normalizedEmail });
      setActiveUserProfile(profile);
      rememberUserProfileForEmail(normalizedEmail, profile);
      window.localStorage.setItem(DEMO_SESSION_KEY, "true");
      window.localStorage.setItem(LAST_WORKSPACE_KEY, "global-hub");
      router.push("/w/global-hub/chat");
      router.refresh();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const authResponse =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({
            email,
            password,
          })
        : await supabase.auth.signUp({
            email,
            password,
          });

    if (authResponse.error) {
      setError(authResponse.error.message);
      setLoading(false);
      return;
    }

    if (mode === "signup" && !authResponse.data.session) {
      setMessage("Account created. Confirm your email, then sign in to finish your workspace setup.");
      setLoading(false);
      return;
    }

    const supabaseUser = authResponse.data.user;
    const metadataName =
      (typeof supabaseUser?.user_metadata?.full_name === "string" && supabaseUser.user_metadata.full_name) ||
      (typeof supabaseUser?.user_metadata?.name === "string" && supabaseUser.user_metadata.name) ||
      deriveNameFromEmail(normalizedEmail);
    const metadataAgeRaw = supabaseUser?.user_metadata?.age;
    const metadataAge =
      typeof metadataAgeRaw === "number"
        ? metadataAgeRaw
        : typeof metadataAgeRaw === "string"
          ? Number(metadataAgeRaw)
          : undefined;

    const remembered = getRememberedUserProfileForEmail(normalizedEmail);
    const profile =
      remembered ??
      buildUserProfile({
        fullName: metadataName,
        age: Number.isFinite(metadataAge) ? metadataAge : undefined,
        email: normalizedEmail,
      });
    setActiveUserProfile(profile);
    rememberUserProfileForEmail(normalizedEmail, profile);

    window.localStorage.removeItem(DEMO_SESSION_KEY);
    router.push(nextHref);
    router.refresh();
  }

  return (
    <form className="auth-panel__stack" onSubmit={handleSubmit}>
      {hideModeToggle ? null : (
        <div className="auth-mode-toggle" role="tablist" aria-label="Choose auth mode">
          <button
            className={clsx("auth-mode-toggle__button", mode === "signin" && "is-active")}
            onClick={() => setMode("signin")}
            type="button"
          >
            Sign in
          </button>
          <button
            className={clsx("auth-mode-toggle__button", mode === "signup" && "is-active")}
            onClick={() => setMode("signup")}
            type="button"
          >
            Create account
          </button>
        </div>
      )}
      <label className="field">
        <span>Email</span>
        <input onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
      </label>
      <label className="field">
        <span>Password</span>
        <input onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
      </label>
      {error ? <p className="auth-panel__error">{error}</p> : null}
      {message ? <p className="auth-panel__message">{message}</p> : null}
      <div className="auth-panel__actions auth-panel__actions--column">
        <button className="button button--primary button--full" disabled={loading || !email || !password} type="submit">
          {loading ? (mode === "signin" ? "Signing in..." : "Creating account...") : mode === "signin" ? "Continue" : "Create account"}
        </button>
      </div>
    </form>
  );
}
