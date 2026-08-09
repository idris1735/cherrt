"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "./admin.module.css";
import { adminFetch } from "./use-admin-fetch";

type Overview = {
  churches: { total: number; active: number; pending: number };
  pendingKyc: number; members: number; people: { verified: number; unverified: number };
  recentKyc: { id: string; church: string; status: string; createdAt: string }[];
  recentChurches: { id: string; name: string; status: string; createdAt: string }[];
};
function badge(status: string) {
  return status === "active" ? s.badgeActive : status === "rejected" ? s.badgeRejected : status.includes("pending") ? s.badgePending : s.badgeNeutral;
}

export default function AdminOverview() {
  const [o, setO] = useState<Overview | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => { adminFetch<{ overview: Overview }>("/api/admin/overview").then((r) => { if (r.status === 401) setDenied(true); else setO(r.data?.overview ?? null); }); }, []);
  if (denied) return <div className={s.empty}><h1 className={s.h1}>Not authorized</h1><p>Your account isn&apos;t on the Chertt review team.</p></div>;
  if (!o) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <h1 className={s.h1}>Overview</h1>
      <p className={s.sub}>The foundation at a glance.</p>
      <div className={s.statGrid}>
        <Stat label="Churches" value={o.churches.total} hint={`${o.churches.active} active · ${o.churches.pending} pending`} />
        <Stat label="Pending KYC" value={o.pendingKyc} hint="awaiting review" />
        <Stat label="Members" value={o.members} hint="active memberships" />
        <Stat label="Verified people" value={o.people.verified} hint={`${o.people.unverified} unverified`} />
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Recent applications</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {o.recentKyc.map((k) => <tr key={k.id}><td><Link className={s.rowlink} href={`/admin/kyc/${k.id}`}>{k.church}</Link></td><td><span className={`${s.badge} ${badge(k.status)}`}>{k.status}</span></td><td>{k.createdAt?.slice(0, 10)}</td></tr>)}
            {o.recentKyc.length === 0 && <tr><td colSpan={3} className={s.empty}>No applications yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Newest churches</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {o.recentChurches.map((c) => <tr key={c.id}><td><Link className={s.rowlink} href={`/admin/churches/${c.id}`}>{c.name}</Link></td><td><span className={`${s.badge} ${badge(c.status)}`}>{c.status}</span></td><td>{c.createdAt?.slice(0, 10)}</td></tr>)}
            {o.recentChurches.length === 0 && <tr><td colSpan={3} className={s.empty}>No churches yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </>
  );
}
function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div className={s.stat}><div className={s.statLabel}>{label}</div><div className={s.statValue}>{value}</div>{hint && <div className={s.statHint}>{hint}</div>}</div>;
}
