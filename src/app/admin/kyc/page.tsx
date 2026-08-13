"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; status: string; cac_result: any; id_result: any; reject_reason: string | null; created_at: string };

// Result chips derived from the live check payloads — same rules as the review screen.
function cacChip(r: any): { text: string; cls: string } {
  if (!r || r.error) return { text: r?.error ? "Errored" : "No data", cls: s.badgeRed };
  if (r.company?.active) return { text: "CAC ✓", cls: s.badgeGreen };
  if (r.count > 0) return { text: "CAC inactive", cls: s.badgeAmber };
  return { text: "CAC ✗", cls: s.badgeRed };
}
function idChip(r: any): { text: string; cls: string } {
  if (!r || r.error) return { text: r?.error ? "Errored" : "No data", cls: s.badgeRed };
  return { text: "ID ✓", cls: s.badgeGreen };
}
function trusteeChip(t: string | null): { text: string; cls: string } {
  if (t === "match") return { text: "Trustee ✓", cls: s.badgeGreen };
  if (t === "no_match") return { text: "Trustee ✗", cls: s.badgeRed };
  return { text: "Trustee ?", cls: s.badgeNeutral };
}

const STAGES = [
  { key: "pending", label: "Pending", badge: s.badgeAmber },
  { key: "draft", label: "Needs info", badge: s.badgeNeutral },
  { key: "approved", label: "Approved", badge: s.badgeGreen },
  { key: "rejected", label: "Rejected", badge: s.badgeRed },
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

  if (err) return <div className={s.errorBox}>🔒 Not authorized.</div>;
  if (!rows || !grouped) return <><div className={s.skeleton} style={{ height: 200 }} /></>;
  return (
    <>
      <h1 className={s.pageTitle}>KYC pipeline</h1>
      <p className={s.pageSub}>{rows.length} applications across {STAGES.length} stages.</p>
      <div className={s.toolbar}>
        <input className={`${s.input} ${s.toolbarSearch}`} aria-label="Search applications" placeholder="Search by church…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className={s.pipelineGrid}>
        {STAGES.map((stage) => (
          <div className={s.pipelineCol} key={stage.key}>
            <div className={s.pipelineHead}>
              <span>{stage.label}</span>
              <span className={`${s.badge} ${stage.badge}`}>{(grouped[stage.key] ?? []).length}</span>
            </div>
            {(grouped[stage.key] ?? []).map((r) => {
              const cac = cacChip(r.cac_result);
              const idc = idChip(r.id_result);
              const trustee = trusteeChip(r.trustee_match);
              return (
                <Link className={s.pipelineCard} key={r.id} href={`/admin/kyc/${r.id}`}>
                  <div className={s.pipelineName}>{r.church_legal_name || "Unnamed"}</div>
                  <div className={s.pipelineMeta}>
                    <span className={`${s.badge} ${cac.cls}`}>{cac.text}</span>
                    <span className={`${s.badge} ${idc.cls}`}>{idc.text}</span>
                    <span className={`${s.badge} ${trustee.cls}`}>{trustee.text}</span>
                  </div>
                  <div className={s.feedTime} style={{ marginTop: 6 }}>{r.created_at?.slice(0, 10)}</div>
                  {r.status === "rejected" && r.reject_reason && <div className={s.feedTime}>“{r.reject_reason}”</div>}
                </Link>
              );
            })}
            {(grouped[stage.key] ?? []).length === 0 && <div style={{ padding: "14px 8px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>Empty</div>}
          </div>
        ))}
      </div>
      {rows.length === 0 && <div className={s.emptyState}><div className={s.emptyStateIcon}>🛡️</div><div className={s.emptyStateTitle}>No applications yet</div><div className={s.emptyStateBody}>New applications appear here the moment a church submits.</div></div>}
    </>
  );
}
