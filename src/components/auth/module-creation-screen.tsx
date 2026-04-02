"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/shared/brand-mark";
import { bootstrapWorkspaceFromDraft, getOnboardingDraft, getLastWorkspaceSlug } from "@/lib/services/onboarding-draft";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import type { ModuleKey } from "@/lib/types";

type CreationConfig = {
  label: string;
  accentClass: string;
  detail: string;
  steps: string[];
};

const creationConfigs: Record<ModuleKey, CreationConfig> = {
  toolkit: {
    label: "Business Toolkit",
    accentClass: "creation-panel--toolkit",
    detail: "Approvals, smart documents, inventory, forms, petty cash, staff onboarding, and chat-first operational routing.",
    steps: [
      "Creating your workspace identity",
      "Preparing approval and request lanes",
      "Laying out documents, forms, and inventory memory",
      "Opening the command workspace for Business Toolkit",
    ],
  },
  church: {
    label: "ChurchBase",
    accentClass: "creation-panel--church",
    detail: "Giving, first timers, child check-in, pastoral care, and member-facing communication flows.",
    steps: [
      "Creating your church workspace",
      "Preparing care, follow-up, and giving flows",
      "Laying out child check-in and visitor capture",
      "Opening ChurchBase for your team",
    ],
  },
  store: {
    label: "StoreFront",
    accentClass: "creation-panel--store",
    detail: "Catalog, order capture, receipts, payment links, stock structure, and customer-ready status updates.",
    steps: [
      "Creating your store workspace",
      "Preparing catalog and stock structure",
      "Laying out invoices, receipts, and payment links",
      "Opening StoreFront for daily sales flow",
    ],
  },
  events: {
    label: "Events",
    accentClass: "creation-panel--events",
    detail: "Invitations, RSVP, ticketing, registration, and guest check-in across controlled-entry events.",
    steps: [
      "Creating your event workspace",
      "Preparing RSVP and registration defaults",
      "Laying out ticketing and guest access flow",
      "Opening Events for live coordination",
    ],
  },
};

export function ModuleCreationScreen({ selectedModule }: { selectedModule: ModuleKey }) {
  const router = useRouter();
  const config = creationConfigs[selectedModule];
  const [activeStep, setActiveStep] = useState(0);
  const [destination, setDestination] = useState(`/w/global-hub/modules/${selectedModule}`);
  const [statusNote, setStatusNote] = useState("Checking your workspace setup.");
  const [creationError, setCreationError] = useState("");

  const fallbackDestination = useMemo(() => `/w/global-hub/modules/${selectedModule}`, [selectedModule]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => {
        if (current >= config.steps.length - 1) {
          window.clearInterval(interval);
          return current;
        }

        return current + 1;
      });
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [config.steps.length]);

  useEffect(() => {
    let cancelled = false;

    async function prepareWorkspace() {
      const draft = getOnboardingDraft();

      if (!draft) {
        const existingSlug = getLastWorkspaceSlug();
        if (!cancelled && existingSlug) {
          setDestination(`/w/${existingSlug}/modules/${selectedModule}`);
          setStatusNote("Opening your last workspace.");
        } else if (!cancelled) {
          setDestination(fallbackDestination);
          setStatusNote("No setup draft found. Opening Business Toolkit workspace.");
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setDestination(fallbackDestination);
          setStatusNote("Supabase is unavailable. Opening fallback workspace.");
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setDestination(fallbackDestination);
        setStatusNote("No active session found. Opening demo workspace.");
        return;
      }

      if (!cancelled) {
        setStatusNote("Creating your real workspace and member access.");
      }

      const bootstrap = await bootstrapWorkspaceFromDraft();

      if (cancelled) {
        return;
      }

      if (bootstrap.status === "ready") {
        setDestination(`/w/${bootstrap.slug}/modules/${bootstrap.selectedModule}`);
        setStatusNote("Workspace ready. Opening your module next.");
        return;
      }

      if (bootstrap.status === "auth-required") {
        setDestination(fallbackDestination);
        setStatusNote("Session expired. Opening demo workspace.");
        return;
      }

      if (bootstrap.status === "missing-draft") {
        setDestination(fallbackDestination);
        setStatusNote("Setup draft missing. Opening fallback workspace.");
        return;
      }

      if (bootstrap.status === "unavailable") {
        setDestination(fallbackDestination);
        setStatusNote("Setup service unavailable. Opening fallback workspace.");
        return;
      }

      setCreationError(bootstrap.message || "Workspace setup had an issue.");
      setDestination(fallbackDestination);
      setStatusNote("Could not finish setup. Opening fallback workspace.");
    }

    void prepareWorkspace();

    return () => {
      cancelled = true;
    };
  }, [fallbackDestination, router, selectedModule]);

  useEffect(() => {
    if (activeStep < config.steps.length - 1) {
      return;
    }

    const redirectTimer = window.setTimeout(() => {
      router.push(destination);
    }, 950);

    return () => {
      window.clearTimeout(redirectTimer);
    };
  }, [activeStep, config.steps.length, creationError, destination, router]);

  const progress = ((activeStep + 1) / config.steps.length) * 100;

  return (
    <main className="creation-screen">
      <section className={clsx("creation-panel", config.accentClass)}>
        <div className="creation-panel__topbar">
          <BrandMark compact />
          <span className="creation-panel__step">Step 3 of 3</span>
        </div>

        <div className="creation-panel__body">
          <div className="creation-panel__copy">
            <p className="creation-panel__eyebrow">Setting up your module</p>
            <h1>Building {config.label} for your workspace.</h1>
            <p className="creation-panel__lead">{config.detail}</p>

            <div className="creation-progress">
              <div className="creation-progress__track">
                <span className="creation-progress__bar" style={{ width: `${progress}%` }} />
              </div>
              <div className="creation-progress__meta">
                <strong>{Math.round(progress)}%</strong>
                <span>{statusNote}</span>
              </div>
            </div>

            <div className="creation-step-list">
              {config.steps.map((step, index) => {
                const isComplete = index < activeStep;
                const isActive = index === activeStep;

                return (
                  <div className={clsx("creation-step", isComplete && "is-complete", isActive && "is-active")} key={step}>
                    <span className="creation-step__dot" />
                    <div>
                      <strong>{step}</strong>
                      <p>{isComplete ? "Done" : isActive ? "In progress now" : "Queued next"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="creation-visual">
            <div className="creation-orbit">
              <span className="creation-orbit__ring creation-orbit__ring--outer" />
              <span className="creation-orbit__ring creation-orbit__ring--mid" />
              <span className="creation-orbit__ring creation-orbit__ring--inner" />
              <span className="creation-orbit__core" />
            </div>

            <div className="creation-note">
              <p className="creation-note__label">What Chertt is preparing</p>
              <strong>{config.label} instance</strong>
              <p>Chat-first commands, starter records, and a module home designed around your selected workflow.</p>
              {creationError ? <p className="creation-note__error">{creationError}</p> : null}
            </div>

            <Link className="button button--ghost creation-note__link" href={destination}>
              Skip animation
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
