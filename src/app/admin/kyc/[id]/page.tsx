"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../../use-admin-fetch";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function authHeader(): Promise<Record<string, string>> {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function kBadge(st: string) {
  if (st === "match" || st === "approved") return s.badgeGreen;
  if (st === "no_match" || st === "rejected") return s.badgeRed;
  return s.badgeAmber;
}

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

  if (msg && !app) return <div className={s.errorBox}>{msg}</div>;
  if (!app) return <><div className={s.skeleton} style={{ height: 200 }} /></>;
  return (
    <>
      <Link href="/admin/kyc" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>← KYC</Link>
      <h1 className={s.pageTitle} style={{ marginTop: 8 }}>{app.church_legal_name}</h1>
      <p className={s.pageSub}>IT/RC {app.it_number} · {app.address}</p>

      <div className={s.section}>
        <div className={s.sectionTitle}>Applicant</div>
        <div className={s.card}><div className={s.cardBody}>
          <div className={s.kvGrid}>
            <span className={s.kvKey}>Stated role</span><span>{app.applicant_role ?? "—"}</span>
            <span className={s.kvKey}>Phone</span><span>{app.applicant_phone}</span>
            <span className={s.kvKey}>Email</span><span>{app.email ?? "—"}{app.email_verified_at ? " ✓" : ""}</span>
            <span className={s.kvKey}>Trustee match</span><span><span className={`${s.badge} ${kBadge(app.trustee_match ?? "unknown")}`}>{app.trustee_match ?? "—"}</span></span>
          </div>
        </div></div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Identity photos — compare side by side</div>
        <div className={s.photoRow}>
          <div className={s.photoCol}><div className={s.photoLabel}>Selfie holding ID</div>{app.selfieUrl ? <img src={app.selfieUrl} alt="Selfie" className={s.photoImg} /> : <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No image</div>}</div>
          <div className={s.photoCol}><div className={s.photoLabel}>NIN photo (Mono)</div>{app.idPhotoDataUrl ? <img src={app.idPhotoDataUrl} alt="ID" className={s.photoImg} /> : <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No image</div>}</div>
        </div>
      </div>

      {app.cac_result && <div className={s.section}><div className={s.sectionTitle}>CAC lookup</div><pre style={{ background: "var(--surface-muted, #fafafa)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 12, overflowX: "auto", fontSize: 12, color: "var(--ink)" }}>{JSON.stringify(app.cac_result, null, 2)}</pre></div>}
      {app.id_result && <div className={s.section}><div className={s.sectionTitle}>ID lookup</div><pre style={{ background: "var(--surface-muted, #fafafa)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 12, overflowX: "auto", fontSize: 12, color: "var(--ink)" }}>{JSON.stringify(app.id_result, null, 2)}</pre></div>}

      {msg && <p style={{ color: "#b42020", fontSize: 14, marginTop: 12 }}>{msg}</p>}
      {app.status === "pending" ? (
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button disabled={busy} onClick={() => act("approve")} className={`${s.btn} ${s.btnPrimary}`}>Approve &amp; create church</button>
          <button disabled={busy} onClick={() => act("reject")} className={`${s.btn} ${s.btnDanger}`}>Reject…</button>
        </div>
      ) : <p className={s.pageSub} style={{ marginTop: 24 }}>Already {app.status}.</p>}
    </>
  );
}
