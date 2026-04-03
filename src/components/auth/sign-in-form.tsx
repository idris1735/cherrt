"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  bootstrapWorkspaceFromDraft,
  getLastWorkspaceSlug,
  getOnboardingDraft,
  rememberLastWorkspaceSlug,
} from "@/lib/services/onboarding-draft";
import {
  buildUserProfile,
  deriveNameFromEmail,
  getRememberedUserProfileForEmail,
  rememberUserProfileForEmail,
  setActiveUserProfile,
} from "@/lib/services/profile";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import { getFirstWorkspaceSlugForCurrentUser } from "@/lib/services/supabase-workspace";
import type { ModuleKey } from "@/lib/types";

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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (forcedMode && forcedMode !== mode) {
      setMode(forcedMode);
    }
  }, [forcedMode, mode]);

  function mapAuthErrorMessage(raw: string) {
    const value = raw.toLowerCase();
    if (value.includes("invalid login credentials")) {
      return "Incorrect email or password.";
    }
    if (value.includes("email not confirmed")) {
      return "Confirm your email address first, then sign in.";
    }
    if (value.includes("already registered")) {
      return "An account already exists for this email. Sign in instead.";
    }
    if (value.includes("password should be")) {
      return "Password must be at least 8 characters.";
    }
    return raw;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

    if (!emailPattern.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    if (mode === "signup" && !passwordPattern.test(password)) {
      setError("Password must be at least 8 characters and include a letter and a number.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Authentication service is unavailable right now. Please try again.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/sign-in` : undefined;

    const authResponse =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              emailRedirectTo: redirectTo,
            },
          });

    if (authResponse.error) {
      setError(mapAuthErrorMessage(authResponse.error.message));
      setLoading(false);
      return;
    }

    if (mode === "signup" && !authResponse.data.session) {
      setMessage("Account created. Confirm your email, then sign in.");
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

    const module = onboardingDraft?.selectedModule || selectedModule;
    if (onboardingDraft) {
      const bootstrap = await bootstrapWorkspaceFromDraft();
      if (bootstrap.status === "ready") {
        router.push(`/w/${bootstrap.slug}/chat`);
        router.refresh();
        return;
      }

      if (bootstrap.status === "auth-required") {
        router.push("/auth/sign-in");
        router.refresh();
        return;
      }

      if (bootstrap.status === "error") {
        setError(bootstrap.message || "Could not complete workspace setup. Please try again.");
        setLoading(false);
        return;
      }

      router.push(`/auth/setup?module=${module}`);
      router.refresh();
      return;
    }

    if (lastWorkspaceSlug && lastWorkspaceSlug !== "global-hub") {
      router.push(`/w/${lastWorkspaceSlug}/chat`);
      router.refresh();
      return;
    }

    const workspaceSlug = await getFirstWorkspaceSlugForCurrentUser();
    if (workspaceSlug) {
      rememberLastWorkspaceSlug(workspaceSlug);
      router.push(`/w/${workspaceSlug}/chat`);
      router.refresh();
      return;
    }

    router.push("/auth/modules");
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
        <input
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          required
          type="email"
          value={email}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <div className="password-field">
          <input
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="password-field__toggle"
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
            {showPassword ? (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3 4.5 20 21.5" />
                <path d="M10.6 10.7A3 3 0 0 1 13.3 13.4" />
                <path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c5.4 0 9.4 4.2 10.5 6.5a1 1 0 0 1 0 .9A12.7 12.7 0 0 1 18.8 17" />
                <path d="M6.1 7.2A13.1 13.1 0 0 0 1.5 12a1 1 0 0 0 0 .9A12.5 12.5 0 0 0 8.3 18.6" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M2.1 12.7a1 1 0 0 1 0-.9C3.2 9.5 7.1 5.2 12 5.2s8.8 4.3 9.9 6.6a1 1 0 0 1 0 .9c-1.1 2.3-5 6.6-9.9 6.6s-8.8-4.3-9.9-6.6Z" />
                <circle cx="12" cy="12.2" r="3" />
              </svg>
            )}
          </button>
        </div>
      </label>
      {mode === "signup" ? <p className="auth-panel__hint">Use at least 8 characters with one letter and one number.</p> : null}
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
