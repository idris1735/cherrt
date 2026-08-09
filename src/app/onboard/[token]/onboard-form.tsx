"use client";
import { useState } from "react";
import s from "./onboard.module.css";

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

  if (done) return (
    <Shell><h2 className={s.h1}>Submitted 🙏</h2><p className={s.sub}>Your church is under review. Chertt will message you on WhatsApp once it&apos;s approved.</p></Shell>
  );

  return (
    <Shell>
      <h2 className={s.h1}>Set up your church</h2>
      <p className={s.sub}>We verify every church to keep giving and members safe. This takes a few minutes.</p>
      <form onSubmit={submit} className={s.form}>
        <Field name="church_legal_name" label="Church legal name (as on CAC)" required />
        <Field name="it_number" label="CAC Incorporated-Trustees (IT/RC) number" required />
        <Field name="address" label="Church address" required />
        <Field name="applicant_role" label="Your full name & role (e.g. 'Ada Obi, Trustee')" required />
        <label className={s.field}>ID type
          <select name="id_type" className={s.select} defaultValue="nin"><option value="nin">NIN</option><option value="bvn">BVN</option></select>
        </label>
        <Field name="id_number" label="NIN / BVN number" required />
        <label className={s.field}>Email
          <div className={s.row}>
            <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={s.input} style={{ flex: 1 }} />
            <button type="button" onClick={sendCode} disabled={busy || !email} className={s.btnGhost}>Send code</button>
          </div>
        </label>
        {emailSent && <Field name="email_code" label="6-digit code from your email" required />}
        <label className={s.field}>Selfie holding your ID
          <input name="selfie" type="file" accept="image/*" capture="user" required className={s.input} />
        </label>
        <label className={s.consent}>
          <input name="consent" type="checkbox" required />
          <span>I consent to Chertt verifying my identity and my church&apos;s registration (NDPR).</span>
        </label>
        {error && <p className={s.err}>{error}</p>}
        <button type="submit" disabled={busy} className={s.btn}>{busy ? "Working…" : "Submit for review"}</button>
      </form>
    </Shell>
  );
}

function Field({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <label className={s.field}>{label}<input name={name} required={required} className={s.input} /></label>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div className={s.shell}><div className={s.inner}><div className={s.card}>{children}</div></div></div>;
}
