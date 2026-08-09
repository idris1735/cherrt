"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import s from "../admin.module.css";
import { adminFetch } from "../use-admin-fetch";

type Church = { id: string; name: string; status: string; branches: number; members: number; createdAt: string };
const badge = (st: string) => st === "active" ? s.badgeActive : st === "rejected" ? s.badgeRejected : st.includes("pending") ? s.badgePending : s.badgeNeutral;

export default function ChurchesList() {
  const [rows, setRows] = useState<Church[] | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => { adminFetch<{ churches: Church[] }>("/api/admin/churches").then((r) => { if (r.status === 401) setDenied(true); else setRows(r.data?.churches ?? []); }); }, []);
  if (denied) return <div className={s.empty}><h1 className={s.h1}>Not authorized</h1></div>;
  if (!rows) return <div className={s.empty}>Loading…</div>;
  return (
    <>
      <h1 className={s.h1}>Churches</h1>
      <p className={s.sub}>{rows.length} on the platform.</p>
      <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
        <thead><tr><th>Name</th><th>Status</th><th>Branches</th><th>Members</th><th>Created</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><Link className={s.rowlink} href={`/admin/churches/${c.id}`}>{c.name}</Link></td>
              <td><span className={`${s.badge} ${badge(c.status)}`}>{c.status}</span></td>
              <td>{c.branches}</td><td>{c.members}</td><td>{c.createdAt?.slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className={s.empty}>No churches yet.</td></tr>}
        </tbody>
      </table></div></div>
    </>
  );
}
