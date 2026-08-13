"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import s from "@/components/admin/admin-kit.module.css";
import { adminFetch } from "../use-admin-fetch";

type Church = { id: string; name: string; status: string; branches: number; members: number; givingTotal: number; verifiedPct: number; createdAt: string };

function statusBadge(st: string) {
  if (st === "active") return s.badgeGreen;
  if (st === "rejected") return s.badgeRed;
  if (st.includes("pending")) return s.badgeAmber;
  return s.badgeNeutral;
}

type SortKey = "name" | "members" | "givingTotal" | "createdAt" | "branches";

function Th({ label, k, sort, setSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; setSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th>
      <button
        onClick={() => setSort(k)}
        style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: active ? "var(--accent)" : "inherit", textTransform: "uppercase", letterSpacing: "0.03em", fontSize: 12, fontWeight: active ? 700 : 500, padding: 0 }}
      >
        {label}{active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

export default function ChurchesList() {
  const [rows, setRows] = useState<Church[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });

  useEffect(() => { adminFetch<{ churches: Church[] }>("/api/admin/churches").then((r) => { if (r.status === 401) setErr(true); else setRows(r.data?.churches ?? []); }); }, []);

  const toggleSort = (k: SortKey) => setSort((prev) => ({ key: k, dir: prev.key === k ? (prev.dir === 1 ? -1 : 1) : -1 }));

  const visible = useMemo(() => {
    if (!rows) return [];
    let v = rows;
    if (q.trim()) { const t = q.trim().toLowerCase(); v = v.filter((c) => c.name.toLowerCase().includes(t)); }
    if (status) v = v.filter((c) => c.status === status);
    const dir = sort.dir;
    return [...v].sort((a, b) => {
      const { key } = sort;
      if (key === "name" || key === "createdAt") return String(a[key]).localeCompare(String(b[key])) * dir;
      return ((a[key] as number) - (b[key] as number)) * dir;
    });
  }, [rows, q, status, sort]);

  if (err) return <div className={s.errorBox}>🔒 Not authorized.</div>;
  if (!rows) return <><div className={s.skeleton} style={{ height: 200, marginBottom: 16 }} /><div className={s.skeleton} style={{ height: 16, width: "40%" }} /></>;
  return (
    <>
      <h1 className={s.pageTitle}>Churches</h1>
      <p className={s.pageSub}>{rows.length} on the platform.</p>
      <div className={s.toolbar}>
        <input className={`${s.input} ${s.toolbarSearch}`} aria-label="Search churches" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${s.select}`} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_approval">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className={s.toolbarSpacer} />
        <span className={s.feedTime}>{visible.length} shown</span>
      </div>
      <div className={s.card}><div className={s.tableWrap}><table className={s.table}>
        <thead><tr>
          <Th label="Name" k="name" sort={sort} setSort={toggleSort} />
          <th>Status</th>
          <Th label="Branches" k="branches" sort={sort} setSort={toggleSort} />
          <Th label="Members" k="members" sort={sort} setSort={toggleSort} />
          <th>Verified</th>
          <Th label="Giving" k="givingTotal" sort={sort} setSort={toggleSort} />
          <Th label="Created" k="createdAt" sort={sort} setSort={toggleSort} />
        </tr></thead>
        <tbody>
          {visible.map((c) => (
            <tr key={c.id}>
              <td><Link style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }} href={`/admin/churches/${c.id}`}>{c.name}</Link></td>
              <td><span className={`${s.badge} ${statusBadge(c.status)}`}>{c.status}</span></td>
              <td>{c.branches}</td><td>{c.members}</td>
              <td><span className={`${s.badge} ${c.verifiedPct >= 80 ? s.badgeGreen : c.verifiedPct > 0 ? s.badgeAmber : s.badgeNeutral}`}>{c.verifiedPct}%</span></td>
              <td>₦{c.givingTotal.toLocaleString("en-NG")}</td>
              <td>{c.createdAt?.slice(0, 10)}</td>
            </tr>
          ))}
          {visible.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>{rows.length === 0 ? "No churches yet — approve a KYC application and the church appears here." : "No churches match your search."}</td></tr>}
        </tbody>
      </table></div></div>
    </>
  );
}
