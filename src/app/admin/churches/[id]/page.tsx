"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import s from "../../admin.module.css";
import { adminFetch } from "../../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = {
  org: any;
  workspaces: { id: string; name: string; city: string | null }[];
  members: { name: string; role: string; level: 0 | 1 | 2; joinedAt: string }[];
  kyc: { id: string; status: string } | null;
};
const LVL = ["Unverified", "WhatsApp-verified", "KYC-verified"];
const badge = (st: string) => st === "active" ? s.badgeActive : st === "rejected" ? s.badgeRejected : st.includes("pending") ? s.badgePending : s.badgeNeutral;

export default function ChurchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { adminFetch<{ church: Detail }>(`/api/admin/churches/${id}`).then((r) => { if (!r.data) setMsg("Not authorized or not found."); else setD(r.data.church); }); }, [id]);
  if (msg) return <div className={s.empty}>{msg}</div>;
  if (!d) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <Link href="/admin/churches" className={s.back}>← Churches</Link>
      <h1 className={s.h1} style={{ marginTop: 10 }}>{d.org.name} <span className={`${s.badge} ${badge(d.org.status)}`}>{d.org.status}</span></h1>
      <div className={s.section}>
        <div className={s.sectionTitle}>Details</div>
        <div className={s.kvs}>
          <span className={s.kvKey}>City</span><span>{d.org.requested_city ?? "—"}</span>
          <span className={s.kvKey}>Created</span><span>{d.org.created_at?.slice(0, 10) ?? "—"}</span>
          <span className={s.kvKey}>Approved by</span><span>{d.org.approved_by ?? "—"}</span>
          <span className={s.kvKey}>KYC</span><span>{d.kyc ? <Link className={s.rowlink} href={`/admin/kyc/${d.kyc.id}`}>{d.kyc.status}</Link> : "—"}</span>
        </div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Branches ({d.workspaces.length})</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>City</th></tr></thead>
          <tbody>{d.workspaces.map((w) => <tr key={w.id}><td>{w.name}</td><td>{w.city ?? "—"}</td></tr>)}
          {d.workspaces.length === 0 && <tr><td colSpan={2} className={s.empty}>No branches.</td></tr>}</tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Members ({d.members.length})</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>Role</th><th>Verification</th><th>Joined</th></tr></thead>
          <tbody>{d.members.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.role}</td><td>{LVL[m.level]}</td><td>{m.joinedAt?.slice(0, 10)}</td></tr>)}
          {d.members.length === 0 && <tr><td colSpan={4} className={s.empty}>No members yet.</td></tr>}</tbody>
        </table></div></div>
      </div>
    </>
  );
}
