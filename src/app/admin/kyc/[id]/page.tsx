"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminFetch } from "../../use-admin-fetch";
import { getSupabaseBrowserClient } from "@/lib/services/supabase";
import { countryByCode } from "@/lib/data/location";
import { ConfirmDialog, PhotoModal } from "@/components/admin/dialogs";
import { toast } from "@/components/admin/toast";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function authHeader(): Promise<Record<string, string>> {
  const supa = getSupabaseBrowserClient();
  const token = supa ? (await supa.auth.getSession()).data.session?.access_token : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Chip derivation survives ANY data shape (null, errored, sandbox)
function cacChip(app: any): { text: string; cls: string } {
  const r = app?.cac_result;
  if (!r || r.error) return { text: r?.error ? "Errored" : "No data", cls: "badge-danger" };
  if (r.company?.active) return { text: `Found — ${r.company?.approvedName ?? "company"}`, cls: "badge-success" };
  if (r.count > 0) return { text: "Found — inactive", cls: "badge-warning" };
  return { text: "Not found", cls: "badge-danger" };
}
function trusteeChip(app: any): { text: string; cls: string } {
  const t = app?.trustee_match ?? "unknown";
  if (t === "match") return { text: "Match", cls: "badge-success" };
  if (t === "no_match") return { text: "No match", cls: "badge-danger" };
  return { text: "Unknown", cls: "badge-muted" };
}
function idChip(app: any): { text: string; cls: string } {
  const r = app?.id_result;
  if (!r || r.error) return { text: r?.error ? "Errored" : "No data", cls: "badge-danger" };
  if (r.firstname || r.surname) return { text: `Verified — ${[r.firstname, r.surname].filter(Boolean).join(" ")}`, cls: "badge-success" };
  return { text: "Verified", cls: "badge-success" };
}
function statusBadge(st: string | undefined) {
  if (st === "pending") return "badge-warning";
  if (st === "approved") return "badge-success";
  if (st === "rejected") return "badge-danger";
  return "badge-muted";
}

export default function AdminKycDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [app, setApp] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);

  useEffect(() => { adminFetch<{ application: any }>(`/api/admin/kyc/${id}`).then((r) => { if (!r.data) setMsg("Not authorized or not found."); else setApp(r.data.application); }); }, [id]);

  async function act(action: "approve" | "reject") {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt("Reason for rejection (sent to the applicant):") ?? "";
      if (!reason.trim()) return;
    }
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/kyc/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify({ action, reason }) });
    const j = await res.json(); setBusy(false);
    if (j.ok) {
      toast(`KYC ${action === "approve" ? "approved" : "rejected"} for ${app.church_legal_name ?? "the church"}`, action === "approve" ? "success" : "error");
      router.push("/admin/kyc");
    } else setMsg(j.error ?? j.reason ?? "Action failed.");
  }

  if (msg && !app) return <div className="page"><div className="error-box">{msg}</div></div>;
  if (!app) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;

  const cac = cacChip(app);
  const trustee = trusteeChip(app);
  const idC = idChip(app);
  const isPending = app.status === "pending";

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs">
            <span>Platform</span><span className="sep">/</span>
            <Link href="/admin/kyc">KYC</Link><span className="sep">/</span><span>{app.church_legal_name ?? "Review"}</span>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {app.church_legal_name ?? "Unnamed church"}{" "}
            <span className={`badge ${statusBadge(app.status)}`}>{app.status ?? "draft"}</span>
            {app.church_phone_mismatch && <span className="badge badge-warning">⚠️ Church WhatsApp ≠ applicant number</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn btn-sm" href="/admin/kyc">Back to Pipeline</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }} className="charts-grid-2">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-header"><h3>Submitted Documents</h3><span style={{ fontSize: 12, color: "var(--muted)" }}>Click to zoom</span></div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { label: "Selfie Photo", src: app.selfieUrl },
                  { label: "Government ID", src: app.idPhotoDataUrl },
                  { label: "CAC Certificate", src: app.cacCertUrl },
                ].map((d) => (
                  <div key={d.label} style={{ cursor: d.src ? "pointer" : "default" }} onClick={() => d.src && setZoom(d.src)}>
                    <div style={{ aspectRatio: "1", borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--line)", marginBottom: 8, background: "var(--surface-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {d.src
                        ? <img src={d.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={d.label} />
                        : <span style={{ color: "var(--muted)", fontSize: 12 }}>No image</span>}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: "var(--ink)" }}>{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Verification Results</h3></div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { label: "CAC Lookup", chip: cac, ok: app.cac_result?.company?.active || app.cac_result?.count > 0 },
                  { label: "Trustee Match", chip: trustee, ok: app.trustee_match === "match" },
                  { label: "ID Verification", chip: idC, ok: !!(app.id_result && !app.id_result.error && (app.id_result.firstname || app.id_result.surname)) },
                ].map((r) => (
                  <div key={r.label} style={{ padding: 16, borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", textAlign: "center", background: r.ok ? "var(--success-soft)" : "var(--surface-muted)" }}>
                    <div style={{ fontSize: 24, marginBottom: 8, color: r.ok ? "var(--success)" : "var(--muted)" }}>{r.ok ? "✓" : "○"}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{r.label}</div>
                    <div style={{ marginTop: 6 }}><span className={`badge ${r.chip.cls}`}>{r.chip.text}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {app.cac_result && (
            <div className="card">
              <div className="card-header"><h3>CAC lookup raw</h3></div>
              <div className="card-body"><pre style={{ overflowX: "auto", fontSize: 12, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>{JSON.stringify(app.cac_result, null, 2)}</pre></div>
            </div>
          )}
          {app.id_result && (
            <div className="card">
              <div className="card-header"><h3>ID lookup raw</h3></div>
              <div className="card-body"><pre style={{ overflowX: "auto", fontSize: 12, color: "var(--ink)", fontFamily: "var(--font-mono)" }}>{JSON.stringify(app.id_result, null, 2)}</pre></div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", marginBottom: 12 }}>Applicant</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>{app.applicant_role ?? "—"}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{app.applicant_phone ?? "—"}</div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Email</div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{app.email ?? "—"}{app.email_verified_at ? " ✓" : ""}</div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Submitted</div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{app.created_at?.slice(0, 10)}</div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Status</div>
              <span className={`badge ${statusBadge(app.status)}`}>{app.status ?? "draft"}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", marginBottom: 12 }}>Church identity</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Church WhatsApp</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{app.church_phone ?? "—"}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Location</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{[app.address, app.city, app.state, app.country ? countryByCode(app.country)?.name ?? app.country : null].filter(Boolean).join(", ") || "—"}</div>
            {(app.address_lat != null && app.address_lng != null) && (
              <div style={{ marginTop: 8 }}>
                <a href={`https://maps.google.com/?q=${app.address_lat},${app.address_lng}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>📍 Open in Google Maps</a>
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Username</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{app.username ? `@${app.username}` : "— (assigned from name)"}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Website</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{app.website ?? "—"}</div>
          </div>

          {isPending && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", marginBottom: 12 }}>Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn btn-success w-full" disabled={busy} onClick={() => setConfirming("approve")}>{busy ? "Working…" : "Approve"}</button>
                <button className="btn btn-danger w-full" disabled={busy} onClick={() => setConfirming("reject")}>Reject</button>
              </div>
              {msg && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{msg}</p>}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirming === "approve"}
        title="Approve KYC"
        message={`Approve ${app.church_legal_name ?? "this church"}? This creates the church, seats the applicant as creator, and notifies them on WhatsApp.`}
        confirmLabel="Approve"
        onConfirm={() => { setConfirming(null); act("approve"); }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "reject"}
        title="Reject KYC"
        message={`Reject ${app.church_legal_name ?? "this church"}? You'll be asked for a reason sent to the applicant.`}
        confirmLabel="Reject"
        onConfirm={() => { setConfirming(null); act("reject"); }}
        onCancel={() => setConfirming(null)}
      />

      <PhotoModal src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
