"use client";
import { useState } from "react";

export function OnboardForm({ token }: { token: string }) {
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  async function sendCode() {
    setBusy(true); setError("");
    const res = await fetch("/api/onboard/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, email }) });
    const j = await res.json();
    setBusy(false);
    if (j.ok) setEmailSent(true); else setError(j.error ?? "Couldn't send the code.");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    fd.set("token", token);
    const res = await fetch("/api/onboard/submit", { method: "POST", body: fd });
    const j = await res.json();
    setBusy(false);
    if (j.ok) setDone(true); else setError(j.error ?? "Something went wrong.");
  }

  if (done) return <Shell><h2>Submitted 🙏</h2><p style={p}>Your church is under review. Chertt will message you on WhatsApp once it&apos;s approved.</p></Shell>;

  return (
    <Shell>
      <h2 style={{ marginBottom: 4 }}>Set up your church</h2>
      <p style={p}>We verify every church to keep giving and members safe. This takes a few minutes.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <Field name="church_legal_name" label="Church legal name (as on CAC)" required />
        <Field name="it_number" label="CAC Incorporated-Trustees (IT/RC) number" required />
        <Field name="address" label="Church address" required />
        <Field name="applicant_role" label="Your full name & role (e.g. 'Ada Obi, Trustee')" required />
        <label style={lbl}>ID type
          <select name="id_type" style={inp} defaultValue="nin"><option value="nin">NIN</option><option value="bvn">BVN</option></select>
        </label>
        <Field name="id_number" label="NIN / BVN number" required />
        <label style={lbl}>Email
          <div style={{ display: "flex", gap: 8 }}>
            <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inp, flex: 1 }} />
            <button type="button" onClick={sendCode} disabled={busy || !email} style={btnGhost}>Send code</button>
          </div>
        </label>
        {emailSent && <Field name="email_code" label="6-digit code from your email" required />}
        <label style={lbl}>Selfie holding your ID
          <input name="selfie" type="file" accept="image/*" capture="user" required style={inp} />
        </label>
        <label style={{ ...lbl, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <input name="consent" type="checkbox" required />
          <span style={{ fontSize: 13, color: "#9baba0" }}>I consent to Chertt verifying my identity and my church&apos;s registration (NDPR).</span>
        </label>
        {error && <p style={{ color: "#ff6b6b", fontSize: 14 }}>{error}</p>}
        <button type="submit" disabled={busy} style={btn}>{busy ? "Working…" : "Submit for review"}</button>
      </form>
    </Shell>
  );
}

const p = { color: "#9baba0", fontSize: 14 } as const;
const lbl = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: "#c7d2cb" };
const inp = { padding: "10px 12px", borderRadius: 10, border: "1px solid #26332b", background: "#141d18", color: "#e8efe9", fontSize: 15 } as const;
const btn = { padding: "13px", border: "none", borderRadius: 12, background: "#0b3d2e", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" } as const;
const btnGhost = { padding: "0 14px", border: "1px solid #2e7d5b", borderRadius: 10, background: "transparent", color: "#7fd4a8", fontWeight: 700, cursor: "pointer" } as const;

function Field({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <label style={lbl}>{label}<input name={name} required={required} style={inp} /></label>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "#0e1512", color: "#e8efe9", fontFamily: "system-ui", padding: 24, display: "flex", justifyContent: "center" }}><div style={{ width: "100%", maxWidth: 440 }}>{children}</div></div>;
}
