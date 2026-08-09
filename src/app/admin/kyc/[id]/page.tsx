"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import s from "../../admin.module.css";
import { adminFetch } from "../../use-admin-fetch";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function authHeader(): Promise<Record<string, string>> {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
const badge = (st: string) => st === "match" || st === "approved" ? s.badgeActive : st === "no_match" || st === "rejected" ? s.badgeRejected : s.badgePending;

export default function AdminKycDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [app, setApp] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { adminFetch<{ application: any }>(`/api/admin/kyc/${id}`).then((r) => { if (!r.data) setMsg("Not authorized or not found."); else setApp(r.data.application); }); }, [id]);

  async function act(action: "approve" | "reject") {
    let reason = "";
    if (action === "reject") { reason = window.prompt("Reason for rejection (sent to the applicant):") ?? ""; if (!reason.trim()) return; }
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/kyc/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action, reason }) });
    const j = await res.json(); setBusy(false);
    if (j.ok) router.push("/admin/kyc"); else setMsg(j.error ?? j.reason ?? "Action failed.");
  }

  if (msg && !app) return <div className={s.empty}>{msg}</div>;
  if (!app) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <Link href="/admin/kyc" className={s.back}>← KYC</Link>
      <h1 className={s.h1} style={{ marginTop: 10 }}>{app.church_legal_name}</h1>
      <p className={s.sub}>IT/RC {app.it_number} · {app.address}</p>

      <div className={s.section}>
        <div className={s.sectionTitle}>Applicant</div>
        <div className={s.kvs}>
          <span className={s.kvKey}>Stated</span><span>{app.applicant_role ?? "—"}</span>
          <span className={s.kvKey}>Phone</span><span>{app.applicant_phone}</span>
          <span className={s.kvKey}>Email</span><span>{app.email ?? "—"}{app.email_verified_at ? " ✓" : ""}</span>
          <span className={s.kvKey}>Trustee</span><span><span className={`${s.badge} ${badge(app.trustee_match ?? "unknown")}`}>{app.trustee_match ?? "—"}</span></span>
        </div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Identity photos (compare)</div>
        <div className={s.photoRow}>
          <Photo label="Selfie holding ID" src={app.selfieUrl} />
          <Photo label="ID photo (Mono)" src={app.idPhotoDataUrl} />
        </div>
      </div>

      <div className={s.section}><div className={s.sectionTitle}>CAC lookup</div><pre className={s.pre}>{JSON.stringify(app.cac_result, null, 2)}</pre></div>
      <div className={s.section}><div className={s.sectionTitle}>ID lookup</div><pre className={s.pre}>{JSON.stringify(app.id_result, null, 2)}</pre></div>

      {msg && <p className={s.err}>{msg}</p>}
      {app.status === "pending" ? (
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button disabled={busy} onClick={() => act("approve")} className={s.btn}>Approve &amp; create church</button>
          <button disabled={busy} onClick={() => act("reject")} className={s.btnGhost}>Reject…</button>
        </div>
      ) : <p className={s.sub}>Already {app.status}.</p>}
    </>
  );
}
function Photo({ label, src }: { label: string; src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={s.photo}><div className={s.statLabel}>{label}</div>{src ? <img src={src} alt={label} className={s.photoImg} /> : <div className={s.empty}>No image</div>}</div>;
}
