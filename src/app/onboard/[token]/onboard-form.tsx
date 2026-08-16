"use client";
import { useState, useRef, useEffect } from "react";
import s from "./onboard.module.css";
import { validateOnboard, fileError, normalizePhone, isValidEmail, type FieldErrors } from "@/lib/onboard-validation";
import { COUNTRIES, NIGERIA_STATES, nigeriaCitiesFor } from "@/lib/data/location";
const POSITIONS = [
  "Senior Pastor", "Pastor", "Assistant Pastor", "Minister", "Church Secretary", "Administrator",
  "Trustee", "Finance Officer", "IT / Technical", "Media / Sound", "Choir / Music", "Deacon",
  "Deaconess", "Ushering", "Sunday School Teacher", "Other",
];

const DENOMINATIONS = [
  "RCCG (Redeemed Christian Church of God)", "Catholic", "Anglican", "Methodist", "Baptist",
  "Pentecostal", "Assemblies of God", "Foursquare", "Apostolic", "Deeper Life", "Living Faith (Winners)",
  "Mountain of Fire (MFM)", "Christ Apostolic Church (CAC)", "Non-denominational", "Independent",
];

type Vals = Record<string, string>;

// Display formatters — values stay human-readable; digits are stripped on submit
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}
function formatIdNumber(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
}

export function OnboardForm({ token }: { token: string }) {
  const [v, setV] = useState<Vals>({ id_type: "nin", country: "NG" });
  const [errs, setErrs] = useState<FieldErrors>({});
  const [selfie, setSelfie] = useState<File | null>(null);
  const [cacCert, setCacCert] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string>("");
  const [emailSent, setEmailSent] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState<"" | "code" | "submit">("");
  const [banner, setBanner] = useState("");
  const [done, setDone] = useState(false);
  // Google Maps pick: coordinates of the verified street address (null = typed manually).
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // P2-1: live CAC check on the IT/RC number — never blocks submit.
  const [cac, setCac] = useState<{ state: "idle" | "checking" | "verified" | "not_found" | "error"; name?: string }>({ state: "idle" });
  const cacTimer = useRef<number | null>(null);

  useEffect(() => {
    const it = (v.it_number ?? "").trim();
    const valid = /^[A-Za-z0-9-]{4,15}$/.test(it.replace(/[\s/]/g, ""));
    if (cacTimer.current) { clearTimeout(cacTimer.current); cacTimer.current = null; }
    if (!valid) { setCac({ state: "idle" }); return; }
    setCac({ state: "checking" });
    cacTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/onboard/cac-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, it_number: it }) });
        const j = await res.json();
        if (j.ok && j.verified) setCac({ state: "verified", name: j.name });
        else if (j.ok) setCac({ state: "not_found" });
        else setCac({ state: "error" });
      } catch { setCac({ state: "error" }); }
    }, 700);
    return () => { if (cacTimer.current) { clearTimeout(cacTimer.current); cacTimer.current = null; } };
  }, [v.it_number, token]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let val = e.target.value;
    // Live formatting: phone + ID number get digit grouping as they type
    if (k === "church_phone") val = formatPhone(val);
    if (k === "id_number") val = formatIdNumber(val);
    setV((p) => ({ ...p, [k]: val, ...(k === "state" ? { city: "", city_other: "" } : {}) }));
    if (errs[k]) setErrs((p) => { const n = { ...p }; delete n[k]; return n; });
  };

  // What's still missing — drives the submit button's disabled state + hint
  const missing: string[] = [];
  if (!(v.church_legal_name ?? "").trim()) missing.push("church name");
  if (!(v.it_number ?? "").trim()) missing.push("IT/RC number");
  if (!(v.state ?? "").trim()) missing.push("state");
  if (!(v.city ?? "").trim()) missing.push("city");
  if (!(v.address ?? "").trim()) missing.push("street address");
  if (!(v.full_name ?? "").trim()) missing.push("your full name");
  if (!(v.position ?? "").trim()) missing.push("your position");
  else if (v.position === "Other" && !(v.position_other ?? "").trim()) missing.push("what your position is");
  if (!(v.id_number ?? "").trim()) missing.push("your ID number");
  if (!isValidEmail(v.email ?? "")) missing.push("your email");
  if (!emailSent) missing.push("email verification");
  if (!selfie) missing.push("selfie");
  if (v.consent !== "on") missing.push("consent");
  const submitReady = missing.length === 0;

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
      if (j.ok) { setEmailSent(true); setChannels(j.channels ?? []); setResendIn(60); } else setBanner(j.error ?? "Couldn't send the code.");
    } catch { setBanner("Network error — please try again."); }
    setBusy("");
  }

  const idDigits = (v.id_number ?? "").replace(/\D/g, "");
  const idValid = /^\d{11}$/.test(idDigits);
  const idNote = idDigits.length === 0
    ? "11 digits"
    : idValid
      ? "✓ 11 digits — looks right. We'll verify it against the national ID registry during review."
      : `${idDigits.length}/11 digits`;
  const posOther = v.position === "Other";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrs = validateOnboard(v);
    const sErr = fileError(selfie, "Selfie holding your ID");
    // P1-3 data minimization: the CAC certificate is OPTIONAL (Mono only
    // needs the RC number) — validate it only when one was attached.
    const cErr = cacCert ? fileError(cacCert, "CAC certificate") : null;
    if (sErr) fieldErrs.selfie = sErr;
    if (cErr) fieldErrs.cac = cErr;
    if (!emailSent) fieldErrs.email_code = "Verify your email — tap “Send code” first.";
    else if (!/^\d{6}$/.test((v.email_code ?? "").trim())) fieldErrs.email_code = "Enter the 6-digit code from your email or WhatsApp.";
    if (v.consent !== "on") fieldErrs.consent = "Please give consent to continue.";
    setErrs(fieldErrs);
    if (Object.keys(fieldErrs).length) { setBanner("Please fix the highlighted fields."); return; }

    setBusy("submit"); setBanner("");
    const fd = new FormData();
    fd.set("token", token);
    ["church_legal_name", "it_number", "address", "city", "city_other", "state", "country", "denomination", "full_name", "position", "position_other", "id_type", "email", "email_code", "username", "website"].forEach((k) => fd.set(k, (v[k] ?? "").trim()));
    if (coords) { fd.set("address_lat", String(coords.lat)); fd.set("address_lng", String(coords.lng)); }
    fd.set("id_number", (v.id_number ?? "").replace(/\s/g, "")); // strip display grouping
    fd.set("church_phone", normalizePhone((v.church_phone ?? "").replace(/\s/g, "")));
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

      <div className={s.steps}>
        <span className={s.step}>🏛️ Church</span>
        <span className={s.stepArrow}>→</span>
        <span className={s.step}>🙋 You</span>
        <span className={s.stepArrow}>→</span>
        <span className={s.step}>🔒 Verify</span>
      </div>

      <div className={s.trust}>
        <span className={s.trustIcon}>🔒</span>
        <span>Your ID and photo are encrypted and seen only by the Chertt review team, used solely to verify you and your church (NDPR). We never share them.</span>
      </div>

      <form onSubmit={submit} noValidate>
        <div className={s.section}>
          <div className={s.sectionTitle}>Your church</div>
          <div className={s.form}>
            <F name="church_legal_name" label="Church legal name" hint="Exactly as registered with CAC" v={v} errs={errs} set={set} autoFocus />
            <F name="it_number" label="CAC IT / RC number" hint="The RC/IT number printed on your CAC certificate" v={v} errs={errs} set={set} />
            {cac.state === "checking" && <span className={s.hint} style={{ marginTop: -6 }}>⏳ Checking CAC registry…</span>}
            {cac.state === "verified" && <span className={s.sentNote} style={{ color: "var(--success, #16a34a)" }}>✓ CAC verified — {cac.name}</span>}
            {cac.state === "not_found" && <span className={s.hint} style={{ marginTop: -6, color: "var(--warning, #b45309)" }}>No CAC match yet — you can still submit and we'll verify manually.</span>}
            {cac.state === "error" && <span className={s.hint} style={{ marginTop: -6 }}>CAC check unavailable right now — we'll verify during review.</span>}
            <label className={s.field}>Country
              <span className={s.hint}>Chertt currently serves Nigerian churches.</span>
              <select name="country" className={`${s.select} ${errs.country ? s.inputBad : ""}`} value={v.country ?? "NG"} onChange={set("country")}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}{c.dial ? ` (${c.dial})` : ""}</option>)}
              </select>
              {errs.country && <span className={s.fieldErr}>{errs.country}</span>}
            </label>
            {v.country === "NG" && (
              <label className={s.field}>State
                <span className={s.hint}>Pick your state — the city list updates to match.</span>
                <select name="state" className={`${s.select} ${errs.state ? s.inputBad : ""}`} value={v.state ?? ""} onChange={set("state")}>
                  <option value="">Select state…</option>
                  {NIGERIA_STATES.map((st) => <option key={st.name} value={st.name}>{st.name}</option>)}
                </select>
                {errs.state && <span className={s.fieldErr}>{errs.state}</span>}
              </label>
            )}
            {v.country === "NG" && (
              <label className={s.field}>City
                <span className={s.hint}>Pick your city or LGA — choose "Other" to type a town that isn't listed.</span>
                <select name="city" className={`${s.select} ${errs.city ? s.inputBad : ""}`} value={v.city ?? ""} onChange={set("city")} disabled={!v.state}>
                  <option value="">{v.state ? "Select city…" : "Select your state first"}</option>
                  {nigeriaCitiesFor(v.state).map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="Other">Other (type my town)</option>
                </select>
                {v.city === "Other" && (
                  <input name="city_other" placeholder="Your town or city" className={`${s.input} ${errs.city ? s.inputBad : ""}`} value={v.city_other ?? ""} onChange={set("city_other")} style={{ marginTop: 6 }} />
                )}
                {errs.city && <span className={s.fieldErr}>{errs.city}</span>}
              </label>
            )}
            <GoogleAddressField v={v} errs={errs} onChange={(val, c) => { setV((p) => ({ ...p, address: val })); setCoords(c); if (errs.address) setErrs((p) => { const n = { ...p }; delete n.address; return n; }); }} />
            <F name="church_phone" label="Church WhatsApp number" hint="The line your members will message — your verification code is sent here. e.g. 0803 123 4567" v={v} errs={errs} set={set} inputMode="tel" />
            <F name="username" label="Church @username (optional)" hint="A short handle like @daystarcc — members will soon be able to find your church by it instead of the code." v={v} errs={errs} set={set} />
            <F name="website" label="Church website (optional)" hint="e.g. gracechapel.org or https://gracechapel.org" v={v} errs={errs} set={set} inputMode="url" />
            <label className={s.field}>Denomination (optional)
              <span className={s.hint}>Your church family — e.g. RCCG, Catholic, Anglican. Pick from the list or type your own.</span>
              <input name="denomination" list="denominations" className={s.input} value={v.denomination ?? ""} onChange={set("denomination")} />
              <datalist id="denominations">
                {DENOMINATIONS.map((d) => <option key={d} value={d} />)}
              </datalist>
            </label>
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>You (the applicant)</div>
          <div className={s.form}>
            <F name="full_name" label="Your full name" hint="Must match the name on your ID" v={v} errs={errs} set={set} />
            <label className={s.field}>Your position
              <span className={s.hint}>Your role in this church — for the review team, not your title on paper.</span>
              <select name="position" className={`${s.select} ${errs.position ? s.inputBad : ""}`} value={v.position ?? ""} onChange={set("position")}>
                <option value="">Select…</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {posOther && (
                <input name="position_other" placeholder="e.g. Protocol Officer, Welfare Coordinator" className={`${s.input} ${errs.position_other ? s.inputBad : ""}`} value={v.position_other ?? ""} onChange={set("position_other")} style={{ marginTop: 6 }} />
              )}
              {errs.position && <span className={s.fieldErr}>{errs.position}</span>}
              {posOther && errs.position_other && <span className={s.fieldErr}>{errs.position_other}</span>}
            </label>
            <label className={s.field}>ID type
              <select name="id_type" className={s.select} value={v.id_type ?? "nin"} onChange={set("id_type")}>
                <option value="nin">NIN</option><option value="bvn">BVN</option>
              </select>
            </label>
            <F name="id_number" label={`${(v.id_type || "nin").toUpperCase()} number`} hint="11 digits" v={v} errs={errs} set={set} inputMode="numeric" />
            {!errs.id_number && <span className={s.hint} style={{ marginTop: -6, color: idValid ? "var(--success, #16a34a)" : undefined }}>{idNote}</span>}
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
              {emailSent && !errs.email && (
                <span className={s.sentNote}>
                  {channels.length === 0 && "Code generated — resend if it doesn't arrive."}
                  {channels.length > 0 && `Code sent via ${channels.map((c) => c === "email" ? "email" : "WhatsApp").join(" and ")}.`}
                  {channels.length > 0 && !channels.includes("email") && " Email delivery is unavailable right now — use the WhatsApp code."}
                </span>
              )}
            </label>
            {emailSent && <F name="email_code" label="6-digit code" v={v} errs={errs} set={set} inputMode="numeric" />}

            <FileField label="CAC certificate (optional)" hint="For the reviewer — Mono verifies the RC number directly. A clear photo or PDF" file={cacCert} err={errs.cac} onPick={pickFile("cac")} accept="image/*,application/pdf" />
            <FileField label="Selfie holding your ID" hint="Your face and your ID clearly visible in one photo" file={selfie} preview={selfiePreview} err={errs.selfie} onPick={pickFile("selfie")} accept="image/*" />

            <label className={s.consent}>
              <input name="consent" type="checkbox" checked={v.consent === "on"} onChange={(e) => setV((p) => ({ ...p, consent: e.target.checked ? "on" : "" }))} />
              <span>I confirm these details are true and consent to Chertt verifying my identity and my church&apos;s CAC registration (NDPR). <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>Privacy policy</a></span>
            </label>
            {errs.consent && <span className={s.fieldErr}>{errs.consent}</span>}
          </div>
        </div>

        {banner && <p className={s.banner} style={{ marginTop: 16 }}>{banner}</p>}
        {!submitReady && (
          <p className={s.missingHint} style={{ marginTop: 16 }}>
            Still to complete: {missing.join(" · ")}.
          </p>
        )}
        <button type="submit" disabled={busy === "submit" || !submitReady} className={s.btn} style={!submitReady ? { opacity: 0.5 } : undefined}>
          {busy === "submit" ? "Uploading & verifying…" : submitReady ? "Submit for review" : "Complete the form to submit"}
        </button>
      </form>
      <p className={s.foot}>Powered by Chertt · Bank-grade verification</p>
    </Shell>
  );
}

function F(props: { name: string; label: string; hint?: string; v: Vals; errs: FieldErrors; set: (k: string) => any; inputMode?: string; optional?: boolean; autoFocus?: boolean }) {
  const { name, label, hint, v, errs, set, inputMode } = props;
  return (
    <label className={s.field}>{label}
      {hint && <span className={s.hint}>{hint}</span>}
      <input name={name} autoFocus={props.autoFocus} inputMode={inputMode as any} className={`${s.input} ${errs[name] ? s.inputBad : ""}`} value={v[name] ?? ""} onChange={set(name)} />
      {errs[name] && <span className={s.fieldErr}>{errs[name]}</span>}
    </label>
  );
}

// Street address with Google Places Autocomplete. With no API key configured
// it degrades to a plain input — the form still works, the reviewer verifies
// the address manually.
/* eslint-disable @typescript-eslint/no-explicit-any */
function GoogleAddressField(props: { v: Vals; errs: FieldErrors; onChange: (val: string, coords: { lat: number; lng: number } | null) => void }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const inputRef = useRef<HTMLInputElement>(null);
  const autoRef = useRef<any>(null);
  const [picked, setPicked] = useState(false);
  const { v, errs } = props;

  useEffect(() => {
    if (!key || !inputRef.current) return;
    const win = window as any;
    const attach = () => {
      if (!inputRef.current || !win.google?.maps?.places) return;
      autoRef.current = new win.google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "ng" },
      });
      autoRef.current.addListener("place_changed", () => {
        const place = autoRef.current?.getPlace?.();
        const formatted = place?.formatted_address || place?.name;
        const loc = place?.geometry?.location;
        if (formatted) {
          props.onChange(formatted, loc && typeof loc.lat === "function" && typeof loc.lng === "function" ? { lat: loc.lat(), lng: loc.lng() } : null);
          setPicked(true);
        }
      });
    };
    if (win.google?.maps?.places) { attach(); return; }
    if (document.querySelector("script[data-gmaps]")) {
      const t = setInterval(() => {
        if ((window as any).google?.maps?.places) { clearInterval(t); attach(); }
      }, 200);
      return () => clearInterval(t);
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.gmaps = "1";
    script.onload = () => attach();
    document.head.appendChild(script);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <label className={s.field}>Street address
      <span className={s.hint}>{key ? "Start typing — real addresses are suggested by Google Maps." : "e.g. 14 Salawa Street, Ikeja"}</span>
      <input ref={inputRef} name="address" autoComplete="street-address" className={`${s.input} ${errs.address ? s.inputBad : ""}`} value={v.address ?? ""} onChange={(e) => { props.onChange(e.target.value, null); setPicked(false); }} />
      {key && picked && <span className={s.sentNote} style={{ color: "var(--success, #16a34a)" }}>📍 Address verified on Google Maps</span>}
      {errs.address && <span className={s.fieldErr}>{errs.address}</span>}
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
