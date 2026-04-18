"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { useToast } from "@/components/providers/toast-provider";
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
  const [mode, setMode] = useState<"signin" | "signup">(forcedMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { notify } = useToast();

  useEffect(() => {
    if (forcedMode && forcedMode !== mode) {
      setMode(forcedMode);
    }
  }, [forcedMode, mode]);

  // Populate email from onboarding draft after mount (localStorage is client-only)
  useEffect(() => {
    const draft = getOnboardingDraft();
    if (draft?.fields.email) setEmail(draft.fields.email);
  }, []);

  // Handle OAuth redirect-back (Google etc. lands back here with a session)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        void handlePostAuth(session.user);
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePostAuth(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null) {
    if (!supabaseUser) return;
    const normalizedEmail = supabaseUser.email?.trim().toLowerCase() ?? "";
    const metadataName =
      (typeof supabaseUser.user_metadata?.full_name === "string" && supabaseUser.user_metadata.full_name) ||
      (typeof supabaseUser.user_metadata?.name === "string" && supabaseUser.user_metadata.name) ||
      deriveNameFromEmail(normalizedEmail);
    const remembered = getRememberedUserProfileForEmail(normalizedEmail);
    const profile =
      remembered ??
      buildUserProfile({ fullName: metadataName, email: normalizedEmail });
    setActiveUserProfile(profile);
    rememberUserProfileForEmail(normalizedEmail, profile);

    const onboardingDraft = getOnboardingDraft();
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

    const lastWorkspaceSlug = getLastWorkspaceSlug();
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
      notify({
        tone: "success",
        title: "Account created",
        description: "Confirm your email address, then sign in.",
      });
      setLoading(false);
      return;
    }

    await handlePostAuth(authResponse.data.user);
  }

  async function handleGoogleSignIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/sign-in` : undefined;
    setLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oauthError) {
      setError(mapAuthErrorMessage(oauthError.message));
      setLoading(false);
    }
  }

  function handleFacebookSignIn() {
    notify({
      tone: "info",
      title: "Coming soon",
      description: "Facebook sign-in is not available yet.",
    });
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
      <div className="auth-panel__actions auth-panel__actions--column">
        <button className="button button--primary button--full" disabled={loading || !email || !password} type="submit">
          {loading ? (mode === "signin" ? "Signing in..." : "Creating account...") : mode === "signin" ? "Continue" : "Create account"}
        </button>
        <div className="auth-divider"><span>or</span></div>
        <div className="auth-oauth">
          <button className="auth-oauth__btn" onClick={handleGoogleSignIn} type="button" disabled={loading}>
            <svg className="auth-oauth__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
            </svg>
            Continue with Google
          </button>
          <button className="auth-oauth__btn auth-oauth__btn--muted" onClick={handleFacebookSignIn} type="button">
            <svg className="auth-oauth__icon" viewBox="0 0 24 24" aria-hidden="true" fill="#1877F2">
              <path d="M24 12.073C24 5.41 18.627 0 12 0S0 5.41 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.885v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" />
            </svg>
            Continue with Facebook
          </button>
        </div>
      </div>
    </form>
  );
}
