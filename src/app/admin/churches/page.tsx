"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetch } from "../use-admin-fetch";
import { InfoTip, TIPS } from "@/components/admin/info-tip";

type Church = { id: string; name: string; status: string; branches: number; members: number; givingTotal: number; verifiedPct: number; createdAt: string };

function statusBadge(st: string) {
  if (st === "active") return "badge-success";
  if (st === "rejected") return "badge-danger";
  if (st.includes("pending")) return "badge-warning";
  return "badge-muted";
}

function verifyBadge(pct: number) {
  if (pct >= 80) return <span className="badge badge-success">L2 · {pct}% <InfoTip text={TIPS.l2} /></span>;
  if (pct > 0) return <span className="badge badge-info">L1 · {pct}% <InfoTip text={TIPS.l1} /></span>;
  return <span className="badge badge-muted">L0 <InfoTip text={TIPS.l0} /></span>;
}

const nf = (n: number) => n.toLocaleString("en-NG");

type SortKey = "name" | "members" | "givingTotal" | "createdAt" | "branches";

export default function ChurchesList() {
  const router = useRouter();
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
    const { key, dir } = sort;
    return [...v].sort((a, b) => {
      if (key === "name" || key === "createdAt") return String(a[key]).localeCompare(String(b[key])) * dir;
      return ((a[key] as number) - (b[key] as number)) * dir;
    });
  }, [rows, q, status, sort]);

  if (err) return <div className="page"><div className="error-box">🔒 Not authorized.</div></div>;
  if (!rows) return <div className="page"><div className="skeleton" style={{ height: 200, marginBottom: 16 }} /><div className="skeleton" style={{ height: 16, width: "40%" }} /></div>;

  return (
    <div className="page animate-in">
      <div className="page-header">
        <div>
          <div className="breadcrumbs"><span>Platform</span><span className="sep">/</span><span>Churches</span></div>
          <h1>Churches</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" className="input" placeholder="Search churches…" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search churches" />
          <select className="input select" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending_approval">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th onClick={() => toggleSort("name")} className={sort.key === "name" ? (sort.dir === 1 ? "sort-asc" : "sort-desc") : ""}>Name <span className="sort-icon">▲▼</span></th>
                <th>Status</th>
                <th onClick={() => toggleSort("branches")} className={sort.key === "branches" ? (sort.dir === 1 ? "sort-asc" : "sort-desc") : ""}>Branches <span className="sort-icon">▲▼</span></th>
                <th onClick={() => toggleSort("members")} className={sort.key === "members" ? (sort.dir === 1 ? "sort-asc" : "sort-desc") : ""}>Members <span className="sort-icon">▲▼</span></th>
                <th>Verified</th>
                <th onClick={() => toggleSort("givingTotal")} className={sort.key === "givingTotal" ? (sort.dir === 1 ? "sort-asc" : "sort-desc") : ""}>Giving <span className="sort-icon">▲▼</span></th>
                <th onClick={() => toggleSort("createdAt")} className={sort.key === "createdAt" ? (sort.dir === 1 ? "sort-asc" : "sort-desc") : ""}>Created <span className="sort-icon">▲▼</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/admin/churches/${c.id}`)} style={{ cursor: "pointer" }} className="clickable-row">
                  <td><Link href={`/admin/churches/${c.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600, color: "var(--ink)" }}>{c.name}</Link></td>
                  <td><span className={`badge ${statusBadge(c.status)}`}>{c.status.replace(/_/g, " ")}</span></td>
                  <td className="tabular">{c.branches}</td>
                  <td className="tabular">{nf(c.members)}</td>
                  <td>{verifyBadge(c.verifiedPct)}</td>
                  <td className="tabular">₦{nf(c.givingTotal)}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{c.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 40 }}>
                  {rows.length === 0 ? "No churches yet — approve a KYC application and the church appears here." : "No churches match your search."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
