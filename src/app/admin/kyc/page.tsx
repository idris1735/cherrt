"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "../admin.module.css";
import { adminFetch } from "../use-admin-fetch";

type Row = { id: string; church_legal_name: string; applicant_phone: string; trustee_match: string | null; created_at: string };
const tbadge = (m: string | null) => m === "match" ? s.badgeActive : m === "no_match" ? s.badgeRejected : s.badgeNeutral;

export default function AdminKycList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => { adminFetch<{ applications: Row[] }>("/api/admin/kyc").then((r) => { if (r.status === 401) setDenied(true); else setRows(r.data?.applications ?? []); }); }, []);
  if (denied) return <div className={s.empty}><h1 className={s.h1}>Not authorized</h1><p>Your account isn&apos;t on the Chertt review team.</p></div>;
  if (!rows) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <h1 className={s.h1}>KYC — pending review</h1>
      <p className={s.sub}>{rows.length} awaiting a decision.</p>
      <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>Church</th><th>Applicant</th><th>Trustee</th><th>Submitted</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link className={s.rowlink} href={`/admin/kyc/${r.id}`}>{r.church_legal_name || "Unnamed"}</Link></td>
              <td>{r.applicant_phone}</td>
              <td><span className={`${s.badge} ${tbadge(r.trustee_match)}`}>{r.trustee_match ?? "—"}</span></td>
              <td>{r.created_at?.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className={s.empty}>Nothing pending. 🎉</td></tr>}
        </tbody>
      </table></div></div>
    </>
  );
}
