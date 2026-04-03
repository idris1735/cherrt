import Image from "next/image";
import Link from "next/link";

import { SignInForm } from "@/components/auth/sign-in-form";
import { BrandMark } from "@/components/shared/brand-mark";
import type { ModuleKey } from "@/lib/types";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module } = await searchParams;
  const selectedModule = (module && ["toolkit", "church", "store", "events"].includes(module) ? module : "toolkit") as ModuleKey;

  return (
    <main className="auth-entry-page">
      <section className="auth-entry-visual">
        <Image
          alt="Warm modern workspace interior"
          className="auth-entry-visual__image"
          fill
          priority
          sizes="(max-width: 980px) 100vw, 58vw"
          src="/hero-office.jpg"
        />
        <div className="auth-entry-visual__overlay" />
        <div className="auth-entry-visual__content">
          <div className="auth-entry-visual__brand">
            <BrandMark />
          </div>
          <div className="auth-entry-visual__copy">
            <p className="auth-entry-visual__eyebrow">Returning to Chertt</p>
            <h1>Pick up work exactly where you left it.</h1>
            <p className="auth-entry-visual__body">
              Approvals, smart documents, staff coordination, and operational records stay in one calm workspace.
            </p>
          </div>

          <div className="auth-entry-visual__metrics">
            <div className="auth-entry-metric">
              <span>One workspace</span>
              <strong>Chat, records, and approvals</strong>
            </div>
            <div className="auth-entry-metric">
              <span>Built for teams</span>
              <strong>Business, church, store, and events</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-entry-panel-wrap">
        <div className="auth-panel auth-panel--tight auth-entry-panel">
          <p className="auth-panel__label">Sign in</p>
          <h2>Welcome back</h2>
          <p className="auth-entry-panel__body">Use your existing account to return to your workspace.</p>
          <SignInForm hideModeToggle forcedMode="signin" selectedModule={selectedModule} />
          <div className="auth-panel__actions auth-panel__actions--column">
            <Link className="button button--ghost button--full" href="/auth/onboarding">
              Back to get started
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
