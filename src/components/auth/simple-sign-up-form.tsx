"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { buildUserProfile, rememberUserProfileForEmail, setActiveUserProfile } from "@/lib/services/profile";

const DEMO_ACCOUNT_EMAIL = "demo@chertt.app";
const DEMO_SESSION_KEY = "chertt:demo-session";
const LAST_WORKSPACE_KEY = "chertt:last-workspace-slug";

export function SimpleSignUpForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const safeName = fullName.trim();
    const safeAge = Number(age);
    if (!safeName || !Number.isFinite(safeAge) || safeAge <= 0) {
      return;
    }

    setLoading(true);
    const profile = buildUserProfile({
      fullName: safeName,
      age: safeAge,
      email: DEMO_ACCOUNT_EMAIL,
    });
    setActiveUserProfile(profile);
    rememberUserProfileForEmail(DEMO_ACCOUNT_EMAIL, profile);
    window.localStorage.setItem(DEMO_SESSION_KEY, "true");
    window.localStorage.setItem(LAST_WORKSPACE_KEY, "global-hub");

    router.push("/w/global-hub/chat");
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
      <div className="auth-panel__actions auth-panel__actions--column">
        <button className="button button--primary button--full" disabled={loading || !fullName.trim() || !age} type="submit">
          {loading ? "Opening Chertt..." : "Continue"}
        </button>
      </div>
    </form>
  );
}
