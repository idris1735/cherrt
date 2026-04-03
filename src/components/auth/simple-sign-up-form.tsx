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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const safeName = fullName.trim();
    const safeAge = Number(age);
    const normalizedEmail = email.trim().toLowerCase();
    if (!safeName || !normalizedEmail || !password || !Number.isFinite(safeAge) || safeAge <= 0) {
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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
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
      setMessage("Account created. Please confirm your email, then sign in.");
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
        <input
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className="auth-panel__error">{error}</p> : null}
      {message ? <p className="auth-panel__message">{message}</p> : null}
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
