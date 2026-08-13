"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "./use-admin-fetch";

type Overview = {
  churches: { total: number; active: number; pending: number };
  pendingKyc: number; members: number; people: { verified: number; unverified: number };
  recentKyc: { id: string; church: string; status: string; createdAt: string }[];
  recentChurches: { id: string; name: string; status: string; createdAt: string }[];
};

type DataRequest = { id: string; kind: string; status: string; note: string; personName: string; createdAt: string };

function statusBadge(status: string) {
  if (status === "active" || status === "approved") return s.badgeGreen;
  if (status === "rejected") return s.badgeRed;
  if (status.includes("pending")) return s.badgeAmber;
  return s.badgeNeutral;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div className={s.statCard}><div className={s.statLabel}>{label}</div><div className={s.statValue}>{value.toLocaleString()}</div>{hint && <div className={s.statHint}>{hint}</div>}</div>;
}

export default function AdminOverview() {
  const [o, setO] = useState<Overview | null>(null);
  const [dataRequests, setDataRequests] = useState<DataRequest[]>([]);
  const [err, setErr] = useState(false);
  useEffect(() => {
    adminFetch<{ overview: Overview; dataRequests?: DataRequest[] }>("/api/admin/overview").then((r) => {
      if (r.status === 401) setErr(true);
      else { setO(r.data?.overview ?? null); setDataRequests(r.data?.dataRequests ?? []); }
    });
  }, []);

  if (err) return <div className={s.errorBox}>🔒 Not authorized — your account isn&apos;t on the Chertt review team.</div>;
  if (!o) return <><div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "60%", marginBottom: 8 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;

  return (
    <>
      <h1 className={s.pageTitle}>Overview</h1>
      <p className={s.pageSub}>The foundation at a glance.</p>
      <div className={s.statGrid}>
        <Stat label="Churches" value={o.churches.total} hint={`${o.churches.active} active · ${o.churches.pending} pending`} />
        <Stat label="Pending KYC" value={o.pendingKyc} hint="awaiting review" />
        <Stat label="Members" value={o.members} hint="active memberships" />
        <Stat label="Verified people" value={o.people.verified} hint={`${o.people.unverified} unverified`} />
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Privacy: open data requests</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Type</th><th>Person</th><th>Note</th><th>When</th><th /></tr></thead>
          <tbody>
            {dataRequests.map((d) => <tr key={d.id}>
              <td><span className={`${s.badge} ${d.kind === "deletion" ? s.badgeRed : d.kind === "access" ? s.badgeGreen : s.badgeAmber}`}>{d.kind}</span></td>
              <td>{d.personName}</td>
              <td>{d.note}</td>
              <td>{d.createdAt?.slice(0, 10)}</td>
              <td style={{ textAlign: "right" }}>
                <button className={s.btnSmall} onClick={async () => {
                  const r = await adminFetch<{ ok: boolean }>(`/api/admin/data-requests/${d.id}`, { method: "POST" });
                  if (r.data?.ok) setDataRequests((xs) => xs.filter((x) => x.id !== d.id));
                }}>Done</button>
              </td>
            </tr>)}
            {dataRequests.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No open requests. 🎉</td></tr>}
          </tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Recent KYC applications</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {o.recentKyc.map((k) => <tr key={k.id}><td><Link className={s.rowlink} href={`/admin/kyc/${k.id}`}>{k.church}</Link></td><td><span className={`${s.badge} ${statusBadge(k.status)}`}>{k.status}</span></td><td>{k.createdAt?.slice(0, 10)}</td></tr>)}
            {o.recentKyc.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No applications yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Newest churches</div>
        <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>Church</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {o.recentChurches.map((c) => <tr key={c.id}><td><Link style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }} href={`/admin/churches/${c.id}`}>{c.name}</Link></td><td><span className={`${s.badge} ${statusBadge(c.status)}`}>{c.status}</span></td><td>{c.createdAt?.slice(0, 10)}</td></tr>)}
            {o.recentChurches.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 32 }}>No churches yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </>
  );
}
