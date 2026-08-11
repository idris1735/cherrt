import Link from "next/link";

import { SimpleSignUpForm } from "@/components/auth/simple-sign-up-form";

export default function CreateAccountPage() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg, #fafafa)",
      fontFamily: "var(--font-sans, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif)",
      color: "var(--ink, #171717)",
      padding: "24px",
    }}>
      <div style={{
        background: "var(--surface, #ffffff)",
        border: "1px solid var(--line, #ebebeb)",
        borderRadius: "var(--radius-lg, 14px)",
        padding: "36px 32px",
        width: "100%",
        maxWidth: "400px",
      }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          Create your account
        </h1>
        <p style={{ fontSize: "14px", color: "var(--muted, #737373)", margin: "0 0 24px" }}>
          Set up your Chertt admin login.
        </p>
        <SimpleSignUpForm />
        <p style={{ fontSize: "13px", color: "var(--muted, #737373)", marginTop: "20px", textAlign: "center" }}>
          <Link href="/auth/sign-in" style={{ color: "var(--accent, #fa8300)", textDecoration: "none" }}>
            Sign in instead
          </Link>
        </p>
      </div>
    </main>
  );
}


