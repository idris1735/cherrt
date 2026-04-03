"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { getLastWorkspaceSlug, getOnboardingDraft, rememberLastWorkspaceSlug } from "@/lib/services/onboarding-draft";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (forcedMode && forcedMode !== mode) {
      setMode(forcedMode);
    }
  }, [forcedMode, mode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

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
            email: normalizedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: normalizedEmail,
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

    const module = onboardingDraft?.selectedModule || selectedModule;
    if (onboardingDraft) {
      router.push(`/auth/creating?module=${module}`);
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
