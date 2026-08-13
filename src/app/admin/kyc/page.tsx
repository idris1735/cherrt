"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; status: string; cac_result: any; id_result: any; reject_reason: string | null; created_at: string };

// Chips derived from the live check payloads — same rules as the review screen.
function cacChip(r: any): { text: string; cls: string } {
  if (!r || r.error) return { text: "CAC —", cls: "badge-danger" };
  if (r.company?.active) return { text: "CAC ✓", cls: "badge-success" };
  if (r.count > 0) return { text: "CAC inactive", cls: "badge-warning" };
  return { text: "CAC ✗", cls: "badge-danger" };
}
function idChip(r: any): { text: string; cls: string } {
  if (!r || r.error) return { text: "ID —", cls: "badge-danger" };
  return { text: "ID ✓", cls: "badge-success" };
}
function trusteeChip(t: string | null): { text: string; cls: string } {
  if (t === "match") return { text: "Trustee ✓", cls: "badge-success" };
  if (t === "no_match") return { text: "Trustee ✗", cls: "badge-danger" };
  return { text: "Trustee ?", cls: "badge-muted" };
}

// The real KYC schema has exactly four statuses: draft / pending / approved /
// rejected. Kimi's "needs_info" is not a real status — collapsed into draft
// (an incomplete application, i.e. what "needs info" meant). Chosen: four columns.
const STAGES = [
  { key: "pending", label: "Pending", color: "var(--warning)" },
  { key: "draft", label: "Draft", color: "var(--info)" },
  { key: "approved", label: "Approved", color: "var(--success)" },
  { key: "rejected", label: "Rejected", color: "var(--danger)" },
] as const;

export default function AdminKycList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => { adminFetch<{ applications: Row[] }>("/api/admin/kyc").then((r) => { if (r.status === 401) setErr(true); else setRows(r.data?.applications ?? []); }); }, []);

  const grouped = useMemo(() => {
    if (!rows) return null;
    const t = q.trim().toLowerCase();
    const filtered = t ? rows.filter((r) => (r.church_legal_name ?? "").toLowerCase().includes(t)) : rows;
    const g: Record<string, Row[]> = { pending: [], draft: [], approved: [], rejected: [] };
    for (const r of filtered) (g[r.status] ?? g.draft).push(r);
    return g;
  }, [rows, q]);

  if (err) return <div className="page"><div className="error-box">🔒 Not authorized.</div></div>;
  if (!rows || !grouped) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><span>Platform</span><span className="sep">/</span><span>KYC</span></div>
          <h1>KYC Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" className="input" placeholder="Search by church…" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applications" />
        </div>
      </div>
      <div className="kyc-board">
        {STAGES.map((stage) => (
          <div className="kyc-column" key={stage.key}>
            <div className="kyc-column-header">
              <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                {stage.label}
              </div>
              <span className="kyc-column-count">{(grouped[stage.key] ?? []).length}</span>
            </div>
            <div className="kyc-cards">
              {(grouped[stage.key] ?? []).map((r) => {
                const cac = cacChip(r.cac_result);
                const idc = idChip(r.id_result);
                const trustee = trusteeChip(r.trustee_match);
                return (
                  <Link className="kyc-card" key={r.id} href={`/admin/kyc/${r.id}`}>
                    <div className="kyc-card-church">{r.church_legal_name || "Unnamed"}</div>
                    <div className="kyc-card-applicant">{r.applicant_phone || "—"}</div>
                    <div className="kyc-card-chips">
                      <span className={`badge ${cac.cls}`} style={{ fontSize: 10, padding: "2px 6px" }}>{cac.text}</span>
                      <span className={`badge ${idc.cls}`} style={{ fontSize: 10, padding: "2px 6px" }}>{idc.text}</span>
                      <span className={`badge ${trustee.cls}`} style={{ fontSize: 10, padding: "2px 6px" }}>{trustee.text}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-light)", marginTop: 8 }}>Submitted {r.created_at?.slice(0, 10)}</div>
                    {r.status === "rejected" && r.reject_reason && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>“{r.reject_reason}”</div>}
                  </Link>
                );
              })}
              {(grouped[stage.key] ?? []).length === 0 && <div style={{ padding: "14px 8px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>Empty</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
