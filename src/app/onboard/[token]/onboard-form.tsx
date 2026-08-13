"use client";
import { useState, useRef, useEffect } from "react";
import s from "./onboard.module.css";
import { validateOnboard, fileError, normalizePhone, isValidEmail, type FieldErrors } from "@/lib/onboard-validation";

const POSITIONS = ["Senior Pastor", "Pastor", "Trustee", "Church Secretary", "Administrator", "Other"];

type Vals = Record<string, string>;

export function OnboardForm({ token }: { token: string }) {
  const [v, setV] = useState<Vals>({ id_type: "nin" });
  const [errs, setErrs] = useState<FieldErrors>({});
  const [selfie, setSelfie] = useState<File | null>(null);
  const [cacCert, setCacCert] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string>("");
  const [emailSent, setEmailSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState<"" | "code" | "submit">("");
  const [banner, setBanner] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setV((p) => ({ ...p, [k]: e.target.value }));
    if (errs[k]) setErrs((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  function pickFile(kind: "selfie" | "cac") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      const label = kind === "selfie" ? "Selfie" : "CAC certificate";
      const fe = f ? fileError(f, label) : null;
      setErrs((p) => { const n = { ...p }; if (fe) n[kind] = fe; else delete n[kind]; return n; });
      if (fe) return;
      if (kind === "selfie") { setSelfie(f); setSelfiePreview(f ? URL.createObjectURL(f) : ""); }
      else setCacCert(f);
    };
  }

  async function sendCode() {
    if (!isValidEmail(v.email)) { setErrs((p) => ({ ...p, email: "Enter a valid email first." })); return; }
    setBusy("code"); setBanner("");
    try {
      const res = await fetch("/api/onboard/email-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, email: v.email }) });
      const j = await res.json();
      if (j.ok) { setEmailSent(true); setResendIn(60); } else setBanner(j.error ?? "Couldn't send the code.");
    } catch { setBanner("Network error — please try again."); }
    setBusy("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrs = validateOnboard(v);
    const sErr = fileError(selfie, "Selfie holding your ID");
    const cErr = fileError(cacCert, "CAC certificate");
    if (sErr) fieldErrs.selfie = sErr;
    if (cErr) fieldErrs.cac = cErr;
    if (!emailSent) fieldErrs.email_code = "Verify your email — tap “Send code” first.";
    else if (!/^\d{6}$/.test((v.email_code ?? "").trim())) fieldErrs.email_code = "Enter the 6-digit code from your email.";
    if (v.consent !== "on") fieldErrs.consent = "Please give consent to continue.";
    setErrs(fieldErrs);
    if (Object.keys(fieldErrs).length) { setBanner("Please fix the highlighted fields."); return; }

    setBusy("submit"); setBanner("");
    const fd = new FormData();
    fd.set("token", token);
    ["church_legal_name", "it_number", "address", "denomination", "full_name", "position", "id_type", "id_number", "email", "email_code"].forEach((k) => fd.set(k, v[k] ?? ""));
    fd.set("church_phone", normalizePhone(v.church_phone));
    fd.set("consent", "on");
    if (selfie) fd.set("selfie", selfie);
    if (cacCert) fd.set("cac_cert", cacCert);
    try {
      const res = await fetch("/api/onboard/submit", { method: "POST", body: fd });
      const j = await res.json();
      if (j.ok) { setDone(true); return; }
      if (j.fields) setErrs((p) => ({ ...p, ...j.fields }));
      setBanner(j.error ?? "Something went wrong. Your details are safe — please try again.");
    } catch { setBanner("Network error — your details are kept, please tap Submit again."); }
    setBusy(""); // files + values stay in state, nothing is lost
  }

  if (done) return (
    <Shell>
      <div className={s.success}>
        <div className={s.successMark}>✅</div>
        <h2 className={s.h1}>Submitted for review</h2>
        <p className={s.sub}>Thank you. Our team verifies your church and will message you on WhatsApp — usually within a day. You can close this page.</p>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <h2 className={s.h1}>Set up your church</h2>
      <p className={s.sub}>Every church is verified so giving and members stay safe. Takes about 3 minutes.</p>
      <div className={s.trust}>
        <span className={s.trustIcon}>🔒</span>
        <span>Your ID and photo are encrypted and seen only by the Chertt review team, used solely to verify you and your church (NDPR). We never share them.</span>
      </div>

      <form onSubmit={submit} noValidate>
        <div className={s.section}>
          <div className={s.sectionTitle}>Your church</div>
          <div className={s.form}>
            <F name="church_legal_name" label="Church legal name" hint="Exactly as registered with CAC" v={v} errs={errs} set={set} />
            <F name="it_number" label="CAC IT / RC number" hint="The RC/IT number printed on your CAC certificate" v={v} errs={errs} set={set} />
            <F name="address" label="Church address" v={v} errs={errs} set={set} />
            <F name="church_phone" label="Church phone" hint="e.g. 0803 123 4567" v={v} errs={errs} set={set} inputMode="tel" />
            <F name="denomination" label="Denomination (optional)" v={v} errs={errs} set={set} optional />
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>You (the applicant)</div>
          <div className={s.form}>
            <F name="full_name" label="Your full name" hint="Must match the name on your ID" v={v} errs={errs} set={set} />
            <label className={s.field}>Your position
              <select name="position" className={`${s.select} ${errs.position ? s.inputBad : ""}`} value={v.position ?? ""} onChange={set("position")}>
                <option value="">Select…</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {errs.position && <span className={s.fieldErr}>{errs.position}</span>}
            </label>
            <label className={s.field}>ID type
              <select name="id_type" className={s.select} value={v.id_type ?? "nin"} onChange={set("id_type")}>
                <option value="nin">NIN</option><option value="bvn">BVN</option>
              </select>
            </label>
            <F name="id_number" label={`${(v.id_type || "nin").toUpperCase()} number`} hint="11 digits" v={v} errs={errs} set={set} inputMode="numeric" />
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>Verify</div>
          <div className={s.form}>
            <label className={s.field}>Email
              <div className={s.row}>
                <input name="email" type="email" inputMode="email" className={`${s.input} ${errs.email ? s.inputBad : ""}`} value={v.email ?? ""} onChange={set("email")} />
                <button type="button" onClick={sendCode} disabled={busy === "code" || resendIn > 0} className={s.btnGhost}>
                  {busy === "code" ? "Sending…" : resendIn > 0 ? `Resend ${resendIn}s` : emailSent ? "Resend" : "Send code"}
                </button>
              </div>
              {errs.email && <span className={s.fieldErr}>{errs.email}</span>}
              {emailSent && !errs.email && <span className={s.sentNote}>Code sent — check your inbox (and spam).</span>}
            </label>
            {emailSent && <F name="email_code" label="6-digit code" v={v} errs={errs} set={set} inputMode="numeric" />}

            <FileField label="CAC certificate" hint="A clear photo or PDF of your certificate" file={cacCert} err={errs.cac} onPick={pickFile("cac")} accept="image/*,application/pdf" />
            <FileField label="Selfie holding your ID" hint="Your face and your ID clearly visible in one photo" file={selfie} preview={selfiePreview} err={errs.selfie} onPick={pickFile("selfie")} accept="image/*" />

            <label className={s.consent}>
              <input name="consent" type="checkbox" checked={v.consent === "on"} onChange={(e) => setV((p) => ({ ...p, consent: e.target.checked ? "on" : "" }))} />
              <span>I confirm these details are true and consent to Chertt verifying my identity and my church&apos;s CAC registration (NDPR).</span>
            </label>
            {errs.consent && <span className={s.fieldErr}>{errs.consent}</span>}
          </div>
        </div>

        {banner && <p className={s.banner} style={{ marginTop: 16 }}>{banner}</p>}
        <button type="submit" disabled={busy === "submit"} className={s.btn}>{busy === "submit" ? "Uploading & verifying…" : "Submit for review"}</button>
      </form>
      <p className={s.foot}>Powered by Chertt · Bank-grade verification</p>
    </Shell>
  );
}

function F(props: { name: string; label: string; hint?: string; v: Vals; errs: FieldErrors; set: (k: string) => any; inputMode?: string; optional?: boolean }) {
  const { name, label, hint, v, errs, set, inputMode } = props;
  return (
    <label className={s.field}>{label}
      {hint && <span className={s.hint}>{hint}</span>}
      <input name={name} inputMode={inputMode as any} className={`${s.input} ${errs[name] ? s.inputBad : ""}`} value={v[name] ?? ""} onChange={set(name)} />
      {errs[name] && <span className={s.fieldErr}>{errs[name]}</span>}
    </label>
  );
}

function FileField(props: { label: string; hint?: string; file: File | null; preview?: string; err?: string; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; accept: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { label, hint, file, preview, err, onPick, accept } = props;
  return (
    <div className={s.field}>{label}
      {hint && <span className={s.hint}>{hint}</span>}
      <div className={s.file} onClick={() => ref.current?.click()}>
        <div className={s.fileHead}><span>{file ? "Change file" : "Tap to add photo or file"}</span><span className={s.filePick}>{file ? "✓ Added" : "Choose"}</span></div>
        {file && (
          <div className={s.preview}>
            {preview ? <img src={preview} alt="" className={s.previewImg} /> : <span>📄</span>}
            <span className={s.previewName}>{file.name}</span>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept={accept} capture={accept.includes("image") && !accept.includes("pdf") ? "user" : undefined} onChange={onPick} style={{ display: "none" }} />
      {err && <span className={s.fieldErr}>{err}</span>}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.shell}><div className={s.inner}>
      <div className={s.brand}><span className={s.brandDot} />Chertt</div>
      <div className={s.card}>{children}</div>
    </div></div>
  );
}
