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

// P0-4: chip derivation survives ANY data shape (null, errored, sandbox)
function cacChip(app: any): { text: string; cls: string } {
  const r = app?.cac_result;
  if (!r || r.error) return { text: r?.error ? "Errored" : "No data", cls: s.badgeRed };
  if (r.company?.active) return { text: `Found — ${r.company?.approvedName ?? "company"}`, cls: s.badgeGreen };
  if (r.count > 0) return { text: "Found — inactive", cls: s.badgeAmber };
  return { text: "Not found", cls: s.badgeRed };
}
function trusteeChip(app: any): { text: string; cls: string } {
  const t = app?.trustee_match ?? "unknown";
  if (t === "match") return { text: "Match", cls: s.badgeGreen };
  if (t === "no_match") return { text: "No match", cls: s.badgeRed };
  return { text: "Unknown", cls: s.badgeNeutral };
}
function idChip(app: any): { text: string; cls: string } {
  const r = app?.id_result;
  if (!r || r.error) return { text: r?.error ? "Errored" : "No data", cls: s.badgeRed };
  if (r.firstname || r.surname) return { text: `Verified — ${[r.firstname, r.surname].filter(Boolean).join(" ")}`, cls: s.badgeGreen };
  return { text: "Verified", cls: s.badgeGreen };
}
function statusBadge(st: string | undefined) {
  if (st === "pending") return s.badgeAmber;
  if (st === "approved") return s.badgeGreen;
  if (st === "rejected") return s.badgeRed;
  return s.badgeNeutral;
}

export default function AdminKycDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [app, setApp] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);

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

  const cac = cacChip(app);
  const trustee = trusteeChip(app);
  const idC = idChip(app);

  return (
    <>
      <Link href="/admin/kyc" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>← KYC</Link>
      <h1 className={s.pageTitle} style={{ marginTop: 8 }}>
        {app.church_legal_name ?? "Unnamed church"}
        <span className={`${s.badge} ${statusBadge(app.status)}`} style={{ marginLeft: 10, verticalAlign: "middle" }}>{app.status ?? "draft"}</span>
      </h1>
      <p className={s.pageSub}>{app.it_number ? `IT/RC ${app.it_number}` : "No IT/RC number"} · {app.address ?? "—"}</p>

      {/* Verification status chips — the reviewer's first read */}
      <div className={s.statGrid} style={{ marginBottom: 20 }}>
        <div className={s.statCard}><div className={s.statLabel}>CAC lookup</div><div style={{ marginTop: 6 }}><span className={`${s.badge} ${cac.cls}`}>{cac.text}</span></div></div>
        <div className={s.statCard}><div className={s.statLabel}>Trustee match</div><div style={{ marginTop: 6 }}><span className={`${s.badge} ${trustee.cls}`}>{trustee.text}</span></div></div>
        <div className={s.statCard}><div className={s.statLabel}>ID (NIN/BVN)</div><div style={{ marginTop: 6 }}><span className={`${s.badge} ${idC.cls}`}>{idC.text}</span></div></div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Applicant</div>
        <div className={s.card}><div className={s.cardBody}>
          <div className={s.kvGrid}>
            <span className={s.kvKey}>Stated role</span><span>{app.applicant_role ?? "—"}</span>
            <span className={s.kvKey}>Phone</span><span>{app.applicant_phone ?? "—"}</span>
            <span className={s.kvKey}>Email</span><span>{app.email ?? "—"}{app.email_verified_at ? " ✓" : ""}</span>
            <span className={s.kvKey}>Denomination</span><span>{app.denomination ?? "—"}</span>
          </div>
        </div></div>
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Photos — click to zoom</div>
        <div className={s.photoRow}>
          {[
            { label: "Selfie holding ID", src: app.selfieUrl },
            { label: "NIN photo (Mono)", src: app.idPhotoDataUrl },
            { label: "CAC certificate", src: app.cacCertUrl },
          ].map((p) => (
            <div className={s.photoCol} key={p.label}>
              <div className={s.photoLabel}>{p.label}</div>
              {p.src
                ? <img src={p.src} alt={p.label} className={s.photoImg} style={{ cursor: "zoom-in" }} onClick={() => setZoom(p.src!)} />
                : <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "var(--radius-sm)" }}>No image</div>}
            </div>
          ))}
        </div>
      </div>

      {app.cac_result && <div className={s.section}><div className={s.sectionTitle}>CAC lookup raw</div><pre style={{ background: "var(--surface-muted, #fafafa)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 12, overflowX: "auto", fontSize: 12, color: "var(--ink)" }}>{JSON.stringify(app.cac_result, null, 2)}</pre></div>}
      {app.id_result && <div className={s.section}><div className={s.sectionTitle}>ID lookup raw</div><pre style={{ background: "var(--surface-muted, #fafafa)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: 12, overflowX: "auto", fontSize: 12, color: "var(--ink)" }}>{JSON.stringify(app.id_result, null, 2)}</pre></div>}

      {msg && <p style={{ color: "#b42020", fontSize: 14, marginTop: 12 }}>{msg}</p>}
      {app.status === "pending" ? (
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button disabled={busy} onClick={() => act("approve")} className={`${s.btn} ${s.btnPrimary}`}>✅ Approve &amp; create church</button>
          <button disabled={busy} onClick={() => act("reject")} className={`${s.btn} ${s.btnDanger}`}>Reject…</button>
        </div>
      ) : <p className={s.pageSub} style={{ marginTop: 24 }}>Already {app.status}.</p>}

      {zoom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, cursor: "zoom-out" }} onClick={() => setZoom(null)}>
          <img src={zoom} alt="Zoom" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
