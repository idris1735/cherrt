import Image from "next/image";
import Link from "next/link";

import { SimpleSignUpForm } from "@/components/auth/simple-sign-up-form";
import { BrandMark } from "@/components/shared/brand-mark";

export default function CreateAccountPage() {
  return (
    <main className="auth-entry-page auth-entry-page--warm">
      <section className="auth-entry-visual">
        <Image
          alt="Modern collaborative office with warm mood"
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
            <p className="auth-entry-visual__eyebrow">Get started</p>
            <h1>Create your account.</h1>
            <p className="auth-entry-visual__body">
              Share your name, email, and password. We&apos;ll take you into workspace setup right after.
            </p>
          </div>
        </div>
      </section>

      <section className="auth-entry-panel-wrap">
        <div className="auth-panel auth-panel--tight auth-entry-panel">
          <p className="auth-panel__label">Create account</p>
          <h2>Quick setup</h2>
          <p className="auth-entry-panel__body">Create your Chertt login in one step.</p>
          <SimpleSignUpForm />
          <div className="auth-panel__actions auth-panel__actions--column">
            <Link className="button button--ghost button--full" href="/auth/onboarding">
              Back
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

