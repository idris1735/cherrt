"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/shared/brand-mark";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { ModuleKey } from "@/lib/types";

const moduleOptions: Array<{
  key: ModuleKey;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    key: "toolkit",
    title: "Business Toolkit",
    description: "Smart documents, approvals, requests, inventory, and internal operations.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M8 7V6a4 4 0 0 1 8 0v1" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M5 8.5h14v10A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-10Z" strokeWidth="1.8" />
        <path d="M9 12h6" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    key: "church",
    title: "ChurchBase",
    description: "Child check-in, giving, first timers, pastoral care, and member-facing workflows.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 4v16" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M8 8h8" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M6.5 20h11" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M8.5 20v-4.5L12 13l3.5 2.5V20" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    key: "store",
    title: "StoreFront",
    description: "Catalog, invoicing, payment links, stock tracking, and order management.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M5 9.5h14l-1 9.5H6L5 9.5Z" strokeWidth="1.8" />
        <path d="M8 9.5V8a4 4 0 1 1 8 0v1.5" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M9 13h6" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    key: "events",
    title: "Events",
    description: "Invitations, registrations, RSVP, ticketing, and access control.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M7 4.5v3M17 4.5v3" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M5 8.5h14v10A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-10Z" strokeWidth="1.8" />
        <path d="M8.5 12h7" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M8.5 15.5h4" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    ),
  },
];

export default function ModulesPage() {
  const router = useRouter();
  const [selectedModule, setSelectedModule] = useState<ModuleKey>("toolkit");
  const continueHref = useMemo(() => `/auth/setup?module=${selectedModule}`, [selectedModule]);

  useEffect(() => {
    let cancelled = false;

    async function requireSession() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          router.replace("/auth/sign-in");
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!cancelled && !session) {
        router.replace("/auth/sign-in");
      }
    }

    void requireSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="modules-screen">
      <section className="modules-panel">
        <div className="modules-panel__topbar">
          <BrandMark compact />
          <span className="modules-panel__step">Step 1 of 3</span>
        </div>

        <div className="modules-panel__heading">
          <h1>Choose your module</h1>
          <p>Select the Chertt environment that matches what you want to do first.</p>
        </div>

        <div className="modules-grid-select">
          {moduleOptions.map((module) => {
            const selected = module.key === selectedModule;

            return (
              <button
                key={module.key}
                className={`module-select-card ${selected ? "is-selected" : ""}`}
                onClick={() => setSelectedModule(module.key)}
                type="button"
              >
                <div className="module-select-card__icon">{module.icon}</div>
                <div className="module-select-card__body">
                  <strong>{module.title}</strong>
                  <p>{module.description}</p>
                </div>
                <span className={`module-select-card__check ${selected ? "is-selected" : ""}`} />
              </button>
            );
          })}
        </div>

        <div className="modules-panel__actions">
          <Link className="button button--primary modules-panel__button" href={continueHref}>
            Continue
          </Link>
          <Link className="button button--ghost modules-panel__button" href="/auth/onboarding">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
