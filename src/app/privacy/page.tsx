import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Chertt",
  description: "How Chertt collects, uses, protects, and returns control of your data (Nigeria NDPA 2023).",
};

export default function PrivacyPage() {
  const card = {
    background: "var(--surface, #fff)",
    border: "1px solid var(--line, #ebebeb)",
    borderRadius: "var(--radius-lg, 14px)",
    padding: "24px 28px",
    marginBottom: 16,
  } as const;
  const h2 = { fontSize: 17, fontWeight: 700, margin: "0 0 10px", color: "var(--ink, #171717)" } as const;
  const p = { fontSize: 14, lineHeight: 1.7, color: "var(--muted, #737373)", margin: "0 0 10px" } as const;
  const li = { fontSize: 14, lineHeight: 1.7, color: "var(--muted, #737373)", margin: "0 0 6px" } as const;
  const strong = { color: "var(--ink, #171717)", fontWeight: 600 } as const;

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg, #fafafa)",
      color: "var(--ink, #171717)",
      fontFamily: "var(--font-sans, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif)",
      padding: "40px 20px 80px",
    }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent, #fa8300)" }} />
          <span style={{ fontWeight: 800, fontSize: 18 }}>Chertt</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Privacy Policy</h1>
        <p style={{ ...p, marginBottom: 24 }}>Last updated: 13 August 2026. This policy is written to comply with the <span style={strong}>Nigeria Data Protection Act (NDPA) 2023</span> and the NDPR. In plain words: your data is yours, we only use it to help your church serve you, and you can see, correct, or delete it at any time.</p>

        <div style={card}>
          <h2 style={h2}>Who we are</h2>
          <p style={p}>Chertt is a service that helps churches run their operations over WhatsApp — welcoming visitors, registering members and children, prayer and pastoral care, giving, and events. Your church is the <span style={strong}>data controller</span> for its members&apos; information; Chertt is the <span style={strong}>data processor</span> that stores and handles it on the church&apos;s behalf. For platform-level verification (KYC), Chertt is the controller.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>What we collect</h2>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li style={li}><span style={strong}>Identity &amp; contact:</span> your name, WhatsApp number, and — if you provide them — email, gender, date of birth, and address.</li>
            <li style={li}><span style={strong}>Church relationship:</span> which church you belong to, your role, departments, and membership history.</li>
            <li style={li}><span style={strong}>What you share in requests:</span> prayer requests, pastoral-care requests, first-timer details, giving records, and form submissions (e.g. dedications).</li>
            <li style={li}><span style={strong}>Children&apos;s data:</span> only when a parent or guardian registers a child — the child&apos;s name, age, class, allergies/medical notes, and who may collect them. <span style={strong}>We never collect data directly from a child.</span></li>
            <li style={li}><span style={strong}>Verification (KYC), for church leaders only:</span> your CAC registration number, national ID (NIN/BVN) number, and a selfie — used solely to confirm you and your church are genuine.</li>
            <li style={li}><span style={strong}>Records of your consent</span> and message-delivery status.</li>
          </ul>
        </div>

        <div style={card}>
          <h2 style={h2}>Why we use it (lawful basis)</h2>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li style={li}><span style={strong}>Your consent</span> — asked for before we store anything, and withdrawable anytime.</li>
            <li style={li}><span style={strong}>To provide the service</span> you and your church asked for (registering you, recording giving, routing your prayer to a pastor).</li>
            <li style={li}><span style={strong}>Legal obligation &amp; fraud prevention</span> — KYC verification of churches, so giving and members stay safe.</li>
          </ul>
          <p style={{ ...p, marginTop: 10, marginBottom: 0 }}>The Chertt assistant <span style={strong}>never prays, counsels, or gives spiritual advice itself</span> — it connects you to a real pastor or leader.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Who we share it with</h2>
          <p style={p}><span style={strong}>We never sell your data.</span> It is visible to your own church&apos;s admins and leaders (to serve you), and shared only with the providers that make the service work:</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li style={li}><span style={strong}>Mono</span> — to verify a church&apos;s CAC registration and a leader&apos;s national ID during KYC.</li>
            <li style={li}><span style={strong}>WhatsApp / Meta</span> — the messaging channel you&apos;re using.</li>
            <li style={li}><span style={strong}>Email &amp; hosting providers</span> — to send verification codes and run the service securely.</li>
          </ul>
        </div>

        <div style={card}>
          <h2 style={h2}>How we protect it</h2>
          <p style={{ ...p, marginBottom: 0 }}>IDs and documents are encrypted, stored privately, and viewable only through short-lived secure links by the verification team. Databases enforce strict access controls (row-level security), and sensitive numbers are minimised — we keep only what a reviewer needs.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>How long we keep it</h2>
          <p style={{ ...p, marginBottom: 0 }}>We keep your data for as long as you&apos;re connected to your church, and delete or anonymise it on request or within a reasonable period after you leave. KYC verification records are kept only as long as needed to meet our legal and fraud-prevention duties.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Your rights</h2>
          <p style={p}>Under the NDPA you can, at any time:</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li style={li}><span style={strong}>Access</span> the data we hold about you.</li>
            <li style={li}><span style={strong}>Correct</span> anything that&apos;s wrong.</li>
            <li style={li}><span style={strong}>Delete</span> your data (&quot;the right to be forgotten&quot;).</li>
            <li style={li}><span style={strong}>Object to or restrict</span> how it&apos;s used, and <span style={strong}>withdraw consent</span>.</li>
            <li style={li}><span style={strong}>Get a copy</span> of your data to take elsewhere.</li>
          </ul>
          <p style={{ ...p, marginTop: 12, marginBottom: 0 }}>To exercise any of these, on WhatsApp reply <span style={strong}>privacy</span> (to learn more), <span style={strong}>stop</span> (to opt out), or <span style={strong}>delete my data</span> — or email <a href="mailto:support@chertt.app" style={{ color: "var(--accent, #fa8300)" }}>support@chertt.app</a>. We respond within the timeframe the NDPA requires.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Children</h2>
          <p style={{ ...p, marginBottom: 0 }}>Children are registered only by a consenting parent or guardian, who provides and controls that information. We collect the minimum needed to keep the child safe (e.g. allergies, authorised pickup) and never message or collect data from a child directly.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Complaints</h2>
          <p style={{ ...p, marginBottom: 0 }}>If you&apos;re unhappy with how your data is handled, contact us first at <a href="mailto:support@chertt.app" style={{ color: "var(--accent, #fa8300)" }}>support@chertt.app</a>. You also have the right to lodge a complaint with the <span style={strong}>Nigeria Data Protection Commission (NDPC)</span>.</p>
        </div>

        <div style={card}>
          <h2 style={h2}>Changes</h2>
          <p style={{ ...p, marginBottom: 0 }}>If we update this policy, we&apos;ll change the date above and, for material changes, ask for your consent again. Contact: <a href="mailto:support@chertt.app" style={{ color: "var(--accent, #fa8300)" }}>support@chertt.app</a>.</p>
        </div>
      </div>
    </main>
  );
}
