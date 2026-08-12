"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../../use-admin-fetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = {
  org: any;
  workspaces: { id: string; name: string; city: string | null }[];
  members: { name: string; role: string; level: 0 | 1 | 2; joinedAt: string; gender: string | null; birthdate: string | null; email: string | null; maritalStatus: string | null }[];
  children?: { name: string; guardian: string; relationship: string | null; allergies: string; medicalNotes: string; classroom: string }[];
  pastoralRequests?: { total: number; open: number; scheduled: number; resolved: number };
  kyc: { id: string; status: string } | null;
};
const LVL = ["Unverified", "WhatsApp-verified", "KYC-verified"];

function statusBadge(st: string) {
  if (st === "active") return s.badgeGreen;
  if (st === "rejected") return s.badgeRed;
  if (st.includes("pending")) return s.badgeAmber;
  return s.badgeNeutral;
}

export default function ChurchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { adminFetch<{ church: Detail }>(`/api/admin/churches/${id}`).then((r) => { if (!r.data) setMsg("Not authorized or not found."); else setD(r.data.church); }); }, [id]);
  if (msg) return <div className={s.errorBox}>{msg}</div>;
  if (!d) return <><div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;
  return (
    <>
      <Link href="/admin/churches" style={{ color: "var(--muted)", textDecoration: "none", fontSize: 13 }}>← Churches</Link>
      <h1 className={s.pageTitle} style={{ marginTop: 8 }}>{d.org.name} <span className={`${s.badge} ${statusBadge(d.org.status)}`}>{d.org.status}</span></h1>
      <div className={s.section}>
        <div className={s.sectionTitle}>Details</div>
        <div className={s.card}><div className={s.cardBody}>
          <div className={s.kvGrid}>
            <span className={s.kvKey}>City</span><span>{d.org.requested_city ?? "—"}</span>
            <span className={s.kvKey}>Created</span><span>{d.org.created_at?.slice(0, 10) ?? "—"}</span>
            <span className={s.kvKey}>Approved by</span><span>{d.org.approved_by ?? "—"}</span>
            <span className={s.kvKey}>KYC</span><span>{d.kyc ? <Link style={{ color: "var(--accent)", textDecoration: "none" }} href={`/admin/kyc/${d.kyc.id}`}>{d.kyc.status}</Link> : "—"}</span>
          </div>
        </div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Branches ({d.workspaces.length})</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>City</th></tr></thead>
          <tbody>{d.workspaces.map((w) => <tr key={w.id}><td>{w.name}</td><td>{w.city ?? "—"}</td></tr>)}
          {d.workspaces.length === 0 && <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No branches.</td></tr>}</tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Members ({d.members.length})</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>Role</th><th>Gender</th><th>Email</th><th>Verification</th><th>Joined</th></tr></thead>
          <tbody>{d.members.map((m, i) => <tr key={i}><td>{m.name}</td><td><span className={`${s.badge} ${s.badgeNeutral}`}>{m.role}</span></td><td>{m.gender ?? "—"}</td><td>{m.email ?? "—"}</td><td>{LVL[m.level]}</td><td>{m.joinedAt?.slice(0, 10)}</td></tr>)}
          {d.members.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No members yet.</td></tr>}</tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Children ({d.children?.length ?? 0})</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Name</th><th>Guardian</th><th>Relationship</th><th>Classroom</th><th>Allergies</th></tr></thead>
          <tbody>{(d.children ?? []).map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.guardian}</td><td>{c.relationship ?? "—"}</td><td>{c.classroom || "—"}</td><td>{c.allergies || "—"}</td></tr>)}
          {(d.children ?? []).length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No children registered.</td></tr>}</tbody>
        </table></div></div>
      </div>
    </>
  );
}
