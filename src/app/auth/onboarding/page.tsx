"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/shared/brand-mark";

const HERO_LINES = [
  "What do you need done?",
  "Draft a letter.",
  "Raise a request.",
  "Log an issue.",
] as const;

export default function OnboardingPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [lineIndex, setLineIndex] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("chertt-theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }

    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("chertt-theme", theme);
    document.documentElement.setAttribute("data-chertt-theme", theme);
  }, [theme]);

  useEffect(() => {
    const currentLine = HERO_LINES[lineIndex];
    const isComplete = visibleChars === currentLine.length;
    const isEmpty = visibleChars === 0;

    const delay = isDeleting ? 36 : isComplete ? 1200 : 58;

    const timer = window.setTimeout(() => {
      if (!isDeleting && !isComplete) {
        setVisibleChars((current) => current + 1);
        return;
      }

      if (!isDeleting && isComplete) {
        setIsDeleting(true);
        return;
      }

      if (isDeleting && !isEmpty) {
        setVisibleChars((current) => current - 1);
        return;
      }

      setIsDeleting(false);
      setLineIndex((current) => (current + 1) % HERO_LINES.length);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isDeleting, lineIndex, visibleChars]);

  const animatedText = HERO_LINES[lineIndex].slice(0, visibleChars);

  return (
    <main className={`get-started-page ${theme === "light" ? "get-started-page--light" : "get-started-page--dark"}`}>
      <header className="get-started-topbar">
        <div className="get-started-brand">
          <BrandMark compact />
          <span className="get-started-brand__name">Chertt</span>
        </div>

        <div className="get-started-topbar__actions">
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="get-started-theme"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            type="button"
          >
            {theme === "dark" ? (
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 11a3 3 0 100-6 3 3 0 000 6zm0-8V1m0 14v-2m7-5h-2M3 8H1m11.07-4.07-1.41 1.41M5.34 10.66l-1.41 1.41m9.14 0-1.41-1.41M5.34 5.34 3.93 3.93" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 2a6 6 0 000 12 6 6 0 006-6 4.5 4.5 0 01-6-6z" />
              </svg>
            )}
          </button>
          <Link className="get-started-link" href="/auth/create-account">
            Create account
          </Link>
          <Link className="get-started-login" href="/auth/sign-in">
            Log in
          </Link>
        </div>
      </header>

      <section className="get-started-stage">
        <div className="get-started-hero">
          <p className="get-started-kicker">Chertt</p>
          <h1>
            {animatedText}
            <span aria-hidden="true" className="get-started-caret">
              |
            </span>
          </h1>
        </div>

        <div className="get-started-composer-wrap">
          <Link aria-label="Try the Chertt demo" className="get-started-composer" href="/w/global-hub/chat">
            <span className="get-started-composer__plus" aria-hidden="true">
              +
            </span>
            <span className="get-started-composer__placeholder">Ask Chertt anything</span>
            <span className="get-started-composer__cta">Try Chertt</span>
          </Link>

          <Link className="get-started-secondary" href="/auth/create-account">
            Create workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
