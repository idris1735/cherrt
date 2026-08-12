import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
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
          Chertt Admin
        </h1>
        <p style={{ fontSize: "14px", color: "var(--muted, #737373)", margin: "0 0 24px" }}>
          Sign in to access the platform dashboard.
        </p>
        <SignInForm />
      </div>
    </main>
  );
}

