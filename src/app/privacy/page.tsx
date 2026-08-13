import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Chertt",
  description: "How Chertt handles your data.",
};

export default function PrivacyPage() {
  const card = {
    background: "var(--surface, #fff)",
    border: "1px solid var(--line, #ebebeb)",
    borderRadius: "var(--radius-lg, 14px)",
    padding: "28px 32px",
    marginBottom: 20,
  } as const;
  const h2 = { fontSize: 17, fontWeight: 700, margin: "0 0 8px" } as const;
  const p = { fontSize: 14, lineHeight: 1.7, color: "var(--muted, #737373)", margin: "0 0 10px" } as const;

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg, #fafafa)",
      color: "var(--ink, #171717)",
      fontFamily: "var(--font-sans, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif)",
      padding: "40px 20px 80px",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent, #fa8300)" }} />
          <span style={{ fontWeight: 800, fontSize: 18 }}>Chertt</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Privacy Policy</h1>
        <p style={{ ...p, marginBottom: 24 }}>Last updated: 13 August 2026 · Nigerian Data Protection Act (NDPA 2023) compliant.</p>

        <div style={card}>
          <h2 style={h2}>What we collect</h2>
          <p style={p}>Your name and WhatsApp number when you message Chertt; church membership and role; details you share in requests (prayer, pastoral care, giving, forms); and — when you set up a church — your CAC registration, ID number, and a selfie, used solely to verify you are who you say you are.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Why we collect it</h2>
          <p style={p}>Only to help your church serve you: records, follow-ups, check-in, giving ledgers, and event access. Your data is never sold, never shared with third parties for marketing, and is visible only to your church&apos;s authorised leaders and the Chertt platform team where necessary to operate the service.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Children</h2>
          <p style={p}>A child&apos;s details are stored only after a parent or guardian explicitly consents, and the guardian is always linked to the child&apos;s record. Pick-up access is restricted to the registered guardians.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Your rights</h2>
          <p style={p}>You can request a copy of your data, object to processing, or ask for deletion at any time — just message <strong>privacy</strong> or <strong>delete my data</strong> on WhatsApp, or email support@chertt.app. If you message <strong>stop</strong>, we will stop messaging you and note your request.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Retention</h2>
          <p style={p}>Data is kept while you are a member of a church on Chertt. Verification documents (selfies, ID results, CAC certificates) are stored in a private, encrypted store accessible only to the review team, and are kept only as long as legally required for our verification records.</p>
        </div>

        <p style={{ ...p, textAlign: "center" }}>Questions? Email support@chertt.app</p>
      </div>
    </main>
  );
}
