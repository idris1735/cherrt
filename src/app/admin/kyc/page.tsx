"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../use-admin-fetch";

type Row = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; created_at: string };

function tBadge(m: string | null) {
  if (m === "match") return s.badgeGreen;
  if (m === "no_match") return s.badgeRed;
  return s.badgeNeutral;
}

export default function AdminKycList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { adminFetch<{ applications: Row[] }>("/api/admin/kyc").then((r) => { if (r.status === 401) setErr(true); else setRows(r.data?.applications ?? []); }); }, []);
  if (err) return <div className={s.errorBox}>🔒 Not authorized.</div>;
  if (!rows) return <><div className={s.skeleton} style={{ height: 200 }} /></>;
  return (
    <>
      <h1 className={s.pageTitle}>KYC — pending review</h1>
      <p className={s.pageSub}>{rows.length} awaiting a decision.</p>
      <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>Church</th><th>Applicant</th><th>Trustee</th><th>Submitted</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }} href={`/admin/kyc/${r.id}`}>{r.church_legal_name || "Unnamed"}</Link></td>
              <td>{r.applicant_phone}</td>
              <td><span className={`${s.badge} ${tBadge(r.trustee_match)}`}>{r.trustee_match ?? "—"}</span></td>
              <td>{r.created_at?.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>Nothing pending. 🎉</td></tr>}
        </tbody>
      </table></div></div>
    </>
  );
}
