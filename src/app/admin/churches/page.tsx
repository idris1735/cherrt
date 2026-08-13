"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../use-admin-fetch";

type Church = { id: string; name: string; status: string; branches: number; members: number; createdAt: string };

function statusBadge(st: string) {
  if (st === "active") return s.badgeGreen;
  if (st === "rejected") return s.badgeRed;
  if (st.includes("pending")) return s.badgeAmber;
  return s.badgeNeutral;
}

export default function ChurchesList() {
  const [rows, setRows] = useState<Church[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { adminFetch<{ churches: Church[] }>("/api/admin/churches").then((r) => { if (r.status === 401) setErr(true); else setRows(r.data?.churches ?? []); }); }, []);
  if (err) return <div className={s.errorBox}>🔒 Not authorized.</div>;
  if (!rows) return <><div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;
  return (
    <>
      <h1 className={s.pageTitle}>Churches</h1>
      <p className={s.pageSub}>{rows.length} on the platform.</p>
      <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>Name</th><th>Status</th><th>Branches</th><th>Members</th><th>Created</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><Link style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }} href={`/admin/churches/${c.id}`}>{c.name}</Link></td>
              <td><span className={`${s.badge} ${statusBadge(c.status)}`}>{c.status}</span></td>
              <td>{c.branches}</td><td>{c.members}</td><td>{c.createdAt?.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>No churches yet — approve a KYC application and the church appears here.</td></tr>}
        </tbody>
      </table></div></div>
    </>
  );
}
