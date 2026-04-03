"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { buildUserProfile, rememberUserProfileForEmail, setActiveUserProfile } from "@/lib/services/profile";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

export function SimpleSignUpForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const safeName = fullName.trim();
    const safeAge = Number(age);
    const normalizedEmail = email.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

    if (!safeName || safeName.length < 2) {
      setError("Enter your full name to continue.");
      return;
    }

    if (!Number.isFinite(safeAge) || safeAge < 13 || safeAge > 120) {
      setError("Age must be between 13 and 120.");
      return;
    }

    if (!emailPattern.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!passwordPattern.test(password)) {
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
    setToast("");
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/sign-in` : undefined;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: safeName,
          age: safeAge,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      setToast("Account created. Confirm your email to complete setup, then log in.");
      setLoading(false);
      return;
    }

    const profile = buildUserProfile({
      fullName: safeName,
      age: safeAge,
      email: normalizedEmail,
    });
    setActiveUserProfile(profile);
    rememberUserProfileForEmail(normalizedEmail, profile);

    router.push("/auth/modules");
    router.refresh();
  }

  return (
    <form className="auth-panel__stack" onSubmit={handleSubmit}>
      {toast ? <div className="auth-toast auth-toast--success">{toast}</div> : null}
      <label className="field">
        <span>Names</span>
        <input
          onChange={(event) => setFullName(event.target.value)}
          placeholder="e.g. Chris Ayo"
          required
          type="text"
          value={fullName}
        />
      </label>
      <label className="field">
        <span>Age</span>
        <input
          min={1}
          onChange={(event) => setAge(event.target.value)}
          placeholder="e.g. 28"
          required
          type="number"
          value={age}
        />
      </label>
      <label className="field">
        <span>Email</span>
        <input
          onChange={(event) => setEmail(event.target.value)}
          placeholder="e.g. you@company.com"
          required
          type="email"
          value={email}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <div className="password-field">
          <input
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Use at least 8 characters"
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
      <p className="auth-panel__hint">Password must include at least one letter and one number.</p>
      {error ? <p className="auth-panel__error">{error}</p> : null}
      <div className="auth-panel__actions auth-panel__actions--column">
        <button
          className="button button--primary button--full"
          disabled={loading || !fullName.trim() || !age || !email.trim() || !password}
          type="submit"
        >
          {loading ? "Creating account..." : "Continue"}
        </button>
      </div>
    </form>
  );
}
