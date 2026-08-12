"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

/** Minimal admin sign-in. Email + password -> /admin. No legacy routing, no sign-up, no onboarding. */
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function mapError(raw: string) {
    const v = raw.toLowerCase();
    if (v.includes("invalid login credentials")) return "Incorrect email or password.";
    if (v.includes("email not confirmed")) return "Confirm your email address first, then sign in.";
    return raw;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) { setError("Enter a valid email address."); return; }
    if (!password) { setError("Enter your password."); return; }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setError("Authentication service is unavailable."); return; }

    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError) {
      setError(mapError(authError.message));
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form className="auth-panel__stack" onSubmit={handleSubmit}>
      <label className="field">
        <span>Email</span>
        <input
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@church.org"
          required
          type="email"
          value={email}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          type="password"
          value={password}
        />
      </label>
      {error && <p className="auth-panel__error">{error}</p>}
      <div className="auth-panel__actions">
        <button className="button button--primary button--full" disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
